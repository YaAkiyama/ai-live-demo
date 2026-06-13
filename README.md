# ai-live-demo

Anthropic Claude を使った「自然言語で UI を書き換える」ライブデモ。
FastAPI + 素の React (Babel スタンドアロン) の単一プロセス構成で、`backend/` がそのまま `frontend/` を配信します。

不特定多数に公開してもプリペイドコストが膨らまないよう、複数レイヤーのコストガードが入っています (詳細は「コスト制御」を参照)。

---

## アーキテクチャ概要

```
frontend/index.html  --[同一オリジン /process]-->  backend/main.py  --[Anthropic API]-->  Claude
                                                       |
                                                       +-- skills/*.md  (システムプロンプトに合成、起動時1回)
                                                       +-- backend/usage.db  (日次トークン/リクエスト数)
```

- `POST /process` — メイン API。Skill を 1 つ選んで JSON を返す。
- `GET /health` — モデル名と今日の使用状況 (トークン/リクエスト数、予算) を返す。
- `GET /test-llm` — `DEBUG=1` のときだけ有効な疎通テスト。

### フロントエンドはビルドレス (重要)

このプロジェクトは **npm / Node.js を使いません**。`frontend/` に `package.json` は存在せず、`npm run dev` も走りません。

- `frontend/index.html` が CDN から React UMD + Babel standalone を読み込み、
  `<script type="text/babel" src="app.jsx">` でブラウザがその場で JSX をコンパイル
- バックエンドの FastAPI が `frontend/` ディレクトリをそのまま静的配信
  (`backend/main.py` 末尾の `app.mount("/", StaticFiles(...))`)
- 開発も本番も「**backend を起動するだけ**」でフロント込みで動く
- フロントから API は `API_BASE = ""` で同一オリジン呼び出し (`frontend/app.jsx:3`)

---

## セットアップ

### 前提

- Python 3.12 系
- [uv](https://docs.astral.sh/uv/) (推奨) または pip

### 開発環境

```bash
cd backend
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY に開発用キーを入れる
# DEBUG=1 にすると /test-llm が叩ける

uv sync               # 依存解決 (pip 派は `pip install -e .`)
uv run python main.py
# → http://127.0.0.1:8001 でフロントもバックも一緒に開く
```

ブラウザで `http://127.0.0.1:8001/` にアクセスすればデモ画面が表示されます。
**フロント側で `npm` を起動する必要はありません** (上の「ビルドレス」の節を参照)。

### 本番環境 (公開デモ)

公開デモ用には **専用 Workspace の API キー** を Anthropic Console で発行し、月次 spend limit を $5 などに設定したうえで、環境変数で渡します。

```bash
# 例: Render Free / Fly.io などのダッシュボードでセット
ANTHROPIC_API_KEY_PROD=sk-ant-...   # 公開デモ用キー (優先される)
DEBUG=0                              # /test-llm を無効化
CORS_ORIGINS=https://your-demo.example.com
DAILY_TOKEN_BUDGET=500000
DAILY_REQUEST_BUDGET=1000
```

`ANTHROPIC_API_KEY_PROD` がセットされていればそちらを優先採用するので、
開発キー (`ANTHROPIC_API_KEY`) を本番ホストに残さなくて済みます。

---

## 環境変数

| 変数 | 既定 | 役割 |
|---|---|---|
| `ANTHROPIC_API_KEY` | (必須) | 開発用キー |
| `ANTHROPIC_API_KEY_PROD` | (任意) | 公開デモ用キー。セットされていれば優先 |
| `DEBUG` | `0` | `1` で `/test-llm` 有効化 |
| `CORS_ORIGINS` | `http://localhost:8000,...` | カンマ区切りの許可 origin |
| `DAILY_TOKEN_BUDGET` | `500000` | 1日のトークン上限。超過で 503 |
| `DAILY_REQUEST_BUDGET` | `1000` | 1日のリクエスト数上限。超過で 503 |

---

## コスト制御

不特定多数公開を前提に、以下の多層防御が入っています。

### 1. モデルとトークン上限

- **モデル**: `claude-haiku-4-5` (Opus 比でコスト約 1/15)
- **max_tokens**: 512 (旧 1024)
- **入力長**: `prompt` は最大 51 文字 (Pydantic で弾く)
  - 短文で十分なデモであり、長文を入れると表示が崩れるため意図的に低めに設定

### 2. Prompt Caching

`skills/` のシステムプロンプトは **起動時に 1 回だけ構築** し、
`cache_control: ephemeral` を付けて送信します。
ヒット時の入力トークン課金は通常の約 1/10 になります。

### 3. レート制限 (slowapi)

`/process` には IP 単位で `5 req/minute` かつ `100 req/day` の制限を適用。
超過時は `429 Too Many Requests`。レスポンスは日本語メッセージ。

### 4. 日次予算ガード

`backend/usage.db` (SQLite) に当日のトークン累計とリクエスト数を記録し、
`DAILY_TOKEN_BUDGET` / `DAILY_REQUEST_BUDGET` を超えた瞬間に
全リクエストを `503` で拒否します。
`GET /health` で残量を確認できます。

### 5. 上流 (Anthropic Console) での止血

コード側のガードはあくまで防御層の一つです。
**必ず Anthropic Console 側でも以下を実施**してください。

- 公開デモ用 Workspace を分離 (例: `ai-live-demo-public`)
- その Workspace の月次 spend limit を低めに設定 (例: $5)
- 使用量アラート (email) を ON

---

## デプロイ手順 (Render Free)

リポジトリルートに `render.yaml` (Blueprint) を同梱しています。
これだけで Free プランの Web Service を 1 サービス作成できます。

### 1. リポジトリを GitHub に push

```bash
git push origin main
```

### 2. Render で Blueprint を有効化

1. https://dashboard.render.com で **New +** → **Blueprint**
2. このリポジトリを選択して **Apply**
3. Render が `render.yaml` を読み取り、サービス `ai-live-demo` を作成

### 3. APIキーを投入

`render.yaml` 内で `ANTHROPIC_API_KEY_PROD` は `sync: false` (秘匿) にしているので、
作成直後は値が空のままです。

1. 作成されたサービスの **Environment** タブを開く
2. `ANTHROPIC_API_KEY_PROD` に、Anthropic Console の Workspace
   "ai-live-demo-public" で発行したキーを貼り付ける
3. **Save Changes** → 自動再デプロイ

### 4. 動作確認

デプロイ完了後、Render が払い出す URL (例 `https://ai-live-demo.onrender.com`) に
ブラウザでアクセスすればデモが動きます。

CORS は `RENDER_EXTERNAL_URL` を `backend/main.py` が自動で許可リストに足すので、
**追加設定なし** で同一オリジン (フロント → `/process`) が通ります。
カスタムドメインを使う場合だけ、`CORS_ORIGINS` を手動で追加してください。

### 5. Free プランの特性

- アクセスがない時間は **スリープ** → 完全無課金
- 初回アクセス時にコールドスタート (10〜30 秒) が入る
- ストレージは ephemeral: 再起動すると `backend/usage.db` (日次カウンタ) はリセット
  → デモ用途では「再起動ごとに予算がリセットされる」=「悪用された日でも翌日にはクリーン」と
  捉えれば許容範囲

### その他のデプロイ先 (参考)

- **Fly.io Free**: `fly launch` で FastAPI を検出させて単一 VM。Render より起動が早い。
- **Cloudflare Pages + Workers**: 静的を Pages、`/process` を Workers に分離。前段で Turnstile / レート制限を併用可能。コードの大幅改造が必要。

---

## API_BASE について

`frontend/app.jsx:3` の `API_BASE = ""` は **同一オリジン呼び出し**を意味します。

- ローカル開発: `http://127.0.0.1:8001/process`
- Render 本番: `https://ai-live-demo.onrender.com/process`

backend が frontend を同居配信する構成なので、デプロイ後も
**フロントエンド側のコード変更は不要**です。

---

## ライセンス

(未設定)
