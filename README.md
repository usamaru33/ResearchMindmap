# Research Mind Map

論文データベースを横断検索して、研究領域のマインドマップを作るアプリです。

- **横断クエリ検索**: ACM DL / IEEE Xplore 形式のブール検索クエリで、OpenAlex・Semantic Scholar・Crossref・arXiv・PubMed・IEEE・DBLP をまとめて検索
- **なんとなく検索**: 「こういう研究」を自然文で書くと、意味の近い論文を探す
- **マインドマップ**: 検索結果から、引用関係とトピックのクラスタを持つ地図を自動で作る
- **研究支援**: 読書管理、引用の展開、BibTeX 出力、関連研究の下書きなど（[機能一覧](docs/FEATURES.md)）

> 開発中です。進み具合は [docs/ROADMAP.md](docs/ROADMAP.md) を見てください。

## 必要なもの

- Node.js 22 以上

## 使い方

```bash
npm install
cp .env.example .env     # APIキーは任意（下記）
npm run dev              # http://localhost:5173 （API は :8787）
```

### APIキー（すべて任意）

| 変数 | 無いとき |
|---|---|
| `OPENALEX_API_KEY` | 同じ IP からの利用者で共有する、少ない無料枠（$0.10/日）で動く。無料のキーで $1/日 になる |
| `SEMANTIC_SCHOLAR_API_KEY` | 回数制限（429）で結果が欠けることがある |
| `IEEE_API_KEY` | IEEE Xplore は使わない（IEEE の論文は OpenAlex / Crossref から取る） |
| `NCBI_API_KEY` | PubMed の回数上限が低い |
| `ANTHROPIC_API_KEY` | LLM を使う機能は、LLM なしの代替処理で動く |

## 開発

```bash
npm run dev:server   # API サーバーのみ（tsx watch）
npm test             # Vitest
npm run lint
npm run build
```

| ディレクトリ | 内容 |
|---|---|
| `src/` | フロントエンド（React + @xyflow/react） |
| `server/` | API サーバー（Hono） |
| `shared/` | フロントとサーバーで共有する型と関数 |
| `docs/` | [設計書](docs/DESIGN.md)・[機能一覧](docs/FEATURES.md)・[工程表](docs/ROADMAP.md) |
| `.claude/skills/` | このリポジトリ用の Claude Code skills |
