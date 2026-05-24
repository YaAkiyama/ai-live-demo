---
name: text-changer
description: デモエリア内の要素のテキスト内容を書き換える Skill。
when_to_use: |
  訪問者が「タイトルを『ようこそ』に変えて」「サブテキストを AI デモにして」
  「ボタンを Start にして」など、デモエリア内の要素の **文字内容そのもの**
  を書き換える指示を出したときに使う。
  Use this skill when the visitor asks to change the **text content** of
  an element inside the demo area (e.g. "rename the title to ...", 
  "change the button text to ...").
---

# Text Changer

デモエリア内の要素のテキスト内容（文字列）を書き換える Skill です。
訪問者の自由入力（日本語または英語）を受け取り、フロントエンドが解釈できる
構造化 JSON の操作指示に変換するのが役割です。

色・フォント・サイズなど **見た目** を変える指示は style-updater の担当で、
本 Skill では扱いません。

## 操作対象（target）

デモエリア内の `data-el-name` 属性を持つ要素のみを操作できます。指定可能な target:

| target       | 説明                                                  |
|--------------|-------------------------------------------------------|
| `title`      | デモエリア中央のタイトル（例「ここに生成結果が表示されます」） |
| `subtitle`   | タイトル直下のサブテキスト（説明文）                  |
| `button`     | プライマリボタンのラベル（例 "Get Started"）          |
| `sub-button` | アウトラインのサブボタンのラベル（例 "Learn more"）   |

上記以外の target は出力しないでください。

## 出力フォーマット

**必ず以下の JSON オブジェクトのみを返してください。** マークダウンのコードフェンス（``` ```）、
前置き、後置き、解説文は **一切含めないでください**。

```
{
  "skill": "text-changer",
  "operations": [
    {"action": "updateText", "target": "title", "value": "新しいテキスト"}
  ],
  "log": "タイトルのテキストを変更しました"
}
```

### フィールド仕様

- `skill` — 固定値 `"text-changer"`
- `operations` — 1 つ以上の操作を配列で。各要素のキー:
  - `action` — 現状は `"updateText"` のみ
  - `target` — 上記「操作対象」のいずれか
  - `value` — 設定するテキスト文字列（**プレーンテキストのみ**）
- `log` — 訪問者に表示する短い実行結果（日本語）

複数の指示が含まれる場合は `operations` に複数要素を入れます。

## 入力例

| 訪問者の指示 | operations |
|---|---|
| 「タイトルを『ようこそ』に変えて」 | `[{"action":"updateText","target":"title","value":"ようこそ"}]` |
| 「サブテキストを AI デモにして」 | `[{"action":"updateText","target":"subtitle","value":"AI デモ"}]` |
| 「ボタンを Start にして」 | `[{"action":"updateText","target":"button","value":"Start"}]` |
| "change the subtitle to 'Welcome to the demo'" | `[{"action":"updateText","target":"subtitle","value":"Welcome to the demo"}]` |
| 「タイトルを『AI Live』、サブボタンを『詳しく』に」 | 2 件の operations（target=`title` と `target=sub-button`）|

引用符（『』, "", '' 等）は囲み記号として扱い、`value` には中身の文字列のみを入れてください。

## 安全ルール

- **デモエリア外（ヘッダー、Skills セクション、フッター、チャット欄など）は操作しません。** `target` は上記表の値に限定してください。
- **`value` はプレーンテキストのみです。** HTML タグ（`<b>`, `<a>`, `<img>` 等）、`<script>`、エスケープシーケンス、テンプレートリテラル等は含めません。`&amp;` 等の HTML エンティティもそのまま文字として扱われます。
- **改行を含む場合**は `\n` ではなく半角スペースに置き換えるか、短いフレーズに要約してください（1 行表示が基本）。
- **指示が曖昧で対象や value を特定できない場合**は、`operations` を空配列 `[]` にし、`log` に
  「対象要素またはテキストが特定できませんでした」のように日本語で理由を書いてください。
