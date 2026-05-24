import json
from pathlib import Path

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

MODEL = "claude-opus-4-7"
SKILLS_DIR = Path(__file__).parent.parent / "skills"
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

app = FastAPI(title="AI Live Demo Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://localhost:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncAnthropic()


def load_skill(name: str) -> str:
    path = SKILLS_DIR / f"{name}.md"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"skill '{name}' not found")
    return path.read_text(encoding="utf-8")


def build_system_prompt() -> str:
    skill_bodies = [load_skill(name) for name in SKILLS_TO_LOAD]
    return ROUTER_PREAMBLE + "\n\n---\n\n".join(skill_bodies) + JSON_ONLY_REMINDER


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
    prompt: str = Field(min_length=1)


@app.get("/")
async def health():
    return {"status": "ok"}


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
async def process(req: ProcessRequest):
    system_prompt = build_system_prompt()

    resp = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system_prompt,
        messages=[
            {"role": "user", "content": req.prompt},
        ],
    )

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
