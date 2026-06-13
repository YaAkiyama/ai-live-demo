import json
import os
import sqlite3
import threading
from datetime import date
from pathlib import Path

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

# ---- Runtime config from env ----------------------------------------------
DEBUG = os.getenv("DEBUG") == "1"

# 公開デモ用キーが ANTHROPIC_API_KEY_PROD で設定されていれば優先採用。
# 開発時は ANTHROPIC_API_KEY (個人キー) にフォールバック。
_prod_key = os.getenv("ANTHROPIC_API_KEY_PROD")
if _prod_key:
    os.environ["ANTHROPIC_API_KEY"] = _prod_key

MODEL = "claude-haiku-4-5"
MAX_OUTPUT_TOKENS = 512
MAX_PROMPT_CHARS = 500

# 1日あたりのグローバル予算上限。超過したら全リクエストを 503 で拒否。
DAILY_TOKEN_BUDGET = int(os.getenv("DAILY_TOKEN_BUDGET", "500000"))
DAILY_REQUEST_BUDGET = int(os.getenv("DAILY_REQUEST_BUDGET", "1000"))

SKILLS_DIR = Path(__file__).parent.parent / "skills"
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
USAGE_DB_PATH = Path(__file__).parent / "usage.db"
SKILLS_TO_LOAD = ("style-updater", "text-changer")

ROUTER_PREAMBLE = (
    "# AI Live Demo - Skill Router\n\n"
    "以下に **複数の Skill 定義** が記載されています。ユーザーの指示を読み、"
    "最も適切な Skill を **1 つだけ** 選択し、その Skill の出力フォーマット"
    "（`skill` フィールドにその Skill 名を入れる）で JSON を返してください。\n\n"
    "## 判断基準\n"
    "- 「色を変える」「太字に」「サイズを大きく」「枠線を」など **見た目** の変更"
    " → `style-updater`\n"
    "- 「テキストを書き換える」「文章を ○○ に」「ラベルを変える」など **文字内容**"
    " の変更 → `text-changer`\n"
    "- 両方該当しそうな場合は、ユーザーの主目的に最も合致する Skill を 1 つ選択。\n"
    "- どの Skill にも該当しない場合は、最も近い Skill の枠で `operations: []` を返し、"
    "`log` に理由を日本語で書いてください。\n\n"
    "---\n\n"
)

JSON_ONLY_REMINDER = (
    "\n\n---\n"
    "## 出力規約（厳守）\n"
    "- 選択した Skill の出力フォーマットで定義された JSON オブジェクトのみを返してください。\n"
    "- 応答の **1 文字目は必ず `{`**、**最後の文字は必ず `}`** です。\n"
    "- マークダウンのコードフェンス（```json ... ``` 等）、前置き、後置き、解説文、"
    "「はい」「了解しました」等の応答文を、JSON の前後に一切付けてはいけません。\n"
    "- 出力全体が単一の JSON オブジェクトとして `json.loads()` でそのままパースできなければなりません。\n"
)


def load_skill(name: str) -> str:
    path = SKILLS_DIR / f"{name}.md"
    if not path.is_file():
        raise RuntimeError(f"skill '{name}' not found at {path}")
    return path.read_text(encoding="utf-8")


def build_system_prompt() -> str:
    skill_bodies = [load_skill(name) for name in SKILLS_TO_LOAD]
    return ROUTER_PREAMBLE + "\n\n---\n\n".join(skill_bodies) + JSON_ONLY_REMINDER


# 起動時に1回だけ構築して使い回す（Prompt Caching の前提）。
SYSTEM_PROMPT = build_system_prompt()


# ---- Daily usage tracking (sqlite) ----------------------------------------
_usage_lock = threading.Lock()


def _usage_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(USAGE_DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS daily_usage ("
        "day TEXT PRIMARY KEY, tokens INTEGER NOT NULL, requests INTEGER NOT NULL)"
    )
    return conn


def get_today_usage() -> tuple[int, int]:
    today = date.today().isoformat()
    with _usage_lock, _usage_conn() as conn:
        row = conn.execute(
            "SELECT tokens, requests FROM daily_usage WHERE day = ?", (today,)
        ).fetchone()
    return (row[0], row[1]) if row else (0, 0)


def record_usage(tokens: int) -> None:
    today = date.today().isoformat()
    with _usage_lock, _usage_conn() as conn:
        conn.execute(
            "INSERT INTO daily_usage(day, tokens, requests) VALUES(?, ?, 1) "
            "ON CONFLICT(day) DO UPDATE SET "
            "tokens = tokens + excluded.tokens, requests = requests + 1",
            (today, tokens),
        )


# ---- FastAPI app & middleware ---------------------------------------------
app = FastAPI(title="AI Live Demo Backend", version="0.2.0")

_default_cors = "http://localhost:8000,http://localhost:5500,http://localhost:8001"
CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", _default_cors).split(",") if o.strip()
]
# Render は自身の外部URLを RENDER_EXTERNAL_URL に注入する。自動で許可リストへ追加。
_render_url = os.getenv("RENDER_EXTERNAL_URL")
if _render_url and _render_url not in CORS_ORIGINS:
    CORS_ORIGINS.append(_render_url)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

client = AsyncAnthropic()


def extract_json(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1].rstrip()
        if s.endswith("```"):
            s = s[:-3].rstrip()
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end <= start:
        return s
    return s[start : end + 1]


class ProcessRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=MAX_PROMPT_CHARS)


@app.get("/health")
async def health():
    tokens, requests = get_today_usage()
    return {
        "status": "ok",
        "model": MODEL,
        "usage_today": {
            "tokens": tokens,
            "requests": requests,
            "token_budget": DAILY_TOKEN_BUDGET,
            "request_budget": DAILY_REQUEST_BUDGET,
        },
    }


if DEBUG:

    @app.get("/test-llm")
    async def test_llm():
        resp = await client.messages.create(
            model=MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": "こんにちは、と一言返して"}],
        )
        return {
            "model": resp.model,
            "text": resp.content[0].text,
            "stop_reason": resp.stop_reason,
        }


@app.post("/process")
@limiter.limit("10/minute;100/day")
async def process(request: Request, req: ProcessRequest):
    tokens_used, requests_made = get_today_usage()
    if requests_made >= DAILY_REQUEST_BUDGET:
        raise HTTPException(status_code=503, detail="daily_request_budget_exhausted")
    if tokens_used >= DAILY_TOKEN_BUDGET:
        raise HTTPException(status_code=503, detail="daily_token_budget_exhausted")

    resp = await client.messages.create(
        model=MODEL,
        max_tokens=MAX_OUTPUT_TOKENS,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": req.prompt}],
    )

    usage = getattr(resp, "usage", None)
    total = 0
    if usage is not None:
        total = (
            getattr(usage, "input_tokens", 0)
            + getattr(usage, "output_tokens", 0)
            + getattr(usage, "cache_creation_input_tokens", 0)
            + getattr(usage, "cache_read_input_tokens", 0)
        )
    record_usage(total)

    raw_text = resp.content[0].text
    json_str = extract_json(raw_text)
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "model_returned_invalid_json",
                "message": str(e),
                "raw": raw_text[:1000],
            },
        )


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
