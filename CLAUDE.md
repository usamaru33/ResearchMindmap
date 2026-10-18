# ResearchMindmap — Claude Code 向けガイド

論文データベースを横断検索して、研究領域のマインドマップを作るアプリ。React + Vite のフロントエンドと、Hono の API サーバーからなる。

## 最初に読むもの

- `docs/DESIGN.md` — 設計書（アーキテクチャ・データモデル・API・クエリ言語）
- `docs/ROADMAP.md` — 工程表。次にやる項目と完了条件
- `docs/FEATURES.md` — 機能一覧と進捗

## プロジェクト skills（`.claude/skills/`）

| skill | 使う場面 |
|---|---|
| `feature-workflow` | すべての変更。ブランチ → 実装 → 検証 → PR → マージ |
| `add-paper-source` | `server/sources/` の追加・修正 |
| `llm-feature` | `server/llm/` や `/api/llm/*` の追加・修正 |
| `smoke-test` | サーバー・検索・マップ生成に関わる PR の前に、実 API で確認するとき |

## コマンド

```bash
npm run dev          # Vite（5173）と API（8787）を同時起動
npm run dev:server   # API サーバーのみ
npm test             # Vitest
npm run lint
npm run build        # tsc -b && vite build（サーバーの型検査を含む）
```

## 守ること

- main へ直接コミットしない。1 機能 = 1 ブランチ = 1 PR、merge commit でマージ
- `.env` と `.cache/` はコミットしない。APIキーはサーバー側だけで扱う
- テストから外部 API を呼ばない（fixture を使う）
- LLM 機能はキーなしでも動くフォールバックを必ず用意する
- UI の文言は直書きせず `src/i18n/messages/` に日本語と英語の両方を追加し、`useT()`（React 外は `tr()`）で出す
