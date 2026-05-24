---
name: style-updater
description: デモエリア内の要素の色・フォント・サイズなど見た目を変更する Skill。
when_to_use: |
  訪問者が「タイトルを青くして」「サブテキストを大きく」「ボタンの色を変えて」など、
  デモエリア内の要素の見た目（color, font, size, border など）の変更を指示したときに使う。
  Use this skill when the visitor asks to change the appearance (color, font, size, border, etc.)
  of an element inside the demo area.
---

# Style Updater

デモエリア内の要素のスタイル（色・フォント・サイズなど）を変更する Skill です。
訪問者の自由入力（日本語または英語）を受け取り、フロントエンドが解釈できる
構造化 JSON の操作指示に変換するのが役割です。

## 操作対象（target）

デモエリア内の `data-el-name` 属性を持つ要素のみを操作できます。現在指定可能な target:

| target       | 説明                                                  |
|--------------|-------------------------------------------------------|
| `title`      | デモエリア中央のタイトル（例「ここに生成結果が表示されます」） |
| `subtitle`   | タイトル直下のサブテキスト（説明文）                  |
| `button`     | プライマリボタン（緑の "Get Started"）                |
| `sub-button` | アウトラインのサブボタン（"Learn more"）              |

上記以外の target は出力しないでください。

## 変更可能なプロパティ（property）

CSS プロパティ名を **kebab-case** で指定します。よく使うもの:

- `color` — 文字色（例: `"#0066ff"`, `"red"`）
- `background-color` — 背景色
- `font-size` — フォントサイズ（例: `"32px"`, `"1.5em"`）
- `font-weight` — 太さ（例: `"700"`, `"bold"`）
- `font-family` — フォント（例: `"'JetBrains Mono', monospace"`）
- `border` — 枠線（例: `"2px solid #10b981"`）
- `border-radius` — 角丸（例: `"12px"`）

`value` は **CSS で有効な文字列**にしてください。色名は色コード（`#rrggbb`）または CSS の色名で。

## 出力フォーマット

**必ず以下の JSON オブジェクトのみを返してください。** マークダウンのコードフェンス（``` ```）、
前置き、後置き、解説文は **一切含めないでください**。

```
{
  "skill": "style-updater",
  "operations": [
    {"action": "updateStyle", "target": "title", "property": "color", "value": "#0066ff"}
  ],
  "log": "タイトルの色を青に変更しました"
}
```

### フィールド仕様

- `skill` — 固定値 `"style-updater"`
- `operations` — 1 つ以上の操作を配列で。各要素のキー:
  - `action` — 現状は `"updateStyle"` のみ
  - `target` — 上記「操作対象」のいずれか
  - `property` — kebab-case の CSS プロパティ名
  - `value` — CSS 値（文字列）
- `log` — 訪問者に表示する短い実行結果（日本語）

複数の指示が含まれる場合は `operations` に複数要素を入れます。

## 入力例

| 訪問者の指示 | operations |
|---|---|
| 「タイトルを青くして」 | `[{"action":"updateStyle","target":"title","property":"color","value":"#0066ff"}]` |
| 「make the button red」 | `[{"action":"updateStyle","target":"button","property":"background-color","value":"#ef4444"}]` |
| 「サブテキストを大きく、太く」 | `[{"action":"updateStyle","target":"subtitle","property":"font-size","value":"18px"},{"action":"updateStyle","target":"subtitle","property":"font-weight","value":"700"}]` |
| 「サブボタンの角を丸く」 | `[{"action":"updateStyle","target":"sub-button","property":"border-radius","value":"999px"}]` |

## 安全ルール

- **デモエリア外（ヘッダー、Skills セクション、フッター、チャット欄など）は操作しません。** `target` は上記表の値に限定してください。
- **`<script>` 挿入や JavaScript 実行を伴う操作は行いません。** 本 Skill はスタイル変更専用です。
- **外部 URL を含む値は使いません。** `background-image: url(...)` のようなリソース読み込みは禁止。
- **指示が曖昧で対象や値を特定できない場合**は、`operations` を空配列 `[]` にし、`log` に
  「対象要素が特定できませんでした」のように日本語で理由を書いてください。
