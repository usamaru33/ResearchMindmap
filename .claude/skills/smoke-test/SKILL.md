---
name: smoke-test
description: Start the ResearchMindmap API server (and optionally the Vite app) locally and verify it end-to-end against the real scholarly APIs with a small, cache-friendly set of requests — health, query parse, cross-database search, vague search, graph build. Use before opening any PR that touches server/, shared/, or the search/map-generation UI, and whenever the user asks "動くか確認して", "実際に検索してみて", "smoke test", or reports that search returns nothing.
---

# スモークテスト（実 API での動作確認）

外部 API には無料枠がある（特に OpenAlex は無キーだと IP 共有で $0.10/日）。**同じクエリを使い回してディスクキャッシュ（`.cache/`）に当てる**こと。新しいクエリを乱発しない。

## 1. サーバーを起動する

```bash
npm run dev:server        # バックグラウンド実行（run_in_background）。既定ポート 8787
```

起動ログに `listening on http://localhost:8787` が出るまで待つ（Monitor で until ループ）。

## 2. 確認するリクエスト（この順で）

```bash
curl -s localhost:8787/api/health | head -c 2000
```
→ `ok: true`。各ソースの `enabled` と理由（キー未設定など）が想定どおりか見る。

```bash
curl -s -X POST localhost:8787/api/query/parse -H 'content-type: application/json' \
  -d '{"query":"title:\"virtual reality\" AND (embodiment OR \"body ownership\") year:2015..2024"}'
```
→ AST が返り、`errors` が空。

```bash
curl -s -X POST localhost:8787/api/search -H 'content-type: application/json' \
  -d '{"query":"\"body ownership\" AND \"virtual reality\" publisher:ieee","limitPerSource":10}' \
  | node -e "const r=JSON.parse(require('fs').readFileSync(0));console.log(r.perSource);console.log(r.results.slice(0,5).map(p=>p.year+' '+p.title+' ['+p.sources+']').join('\n'))"
```
→ 2 つ以上のソースで件数が 0 より大きい。上位がクエリに合っている。`publisher:ieee` なら DOI が `10.1109/` で始まる。

```bash
curl -s -X POST localhost:8787/api/vague-search -H 'content-type: application/json' \
  -d '{"description":"VRで自分の体の大きさが変わったと感じると、周りの物の大きさの感じ方も変わるかを調べた研究","limit":10}' \
  | node -e "const r=JSON.parse(require('fs').readFileSync(0));console.log(r.mode, r.expandedQueries);console.log(r.results.slice(0,5).map(p=>p.year+' '+p.title).join('\n'))"
```
→ 体の大きさの錯覚・物の大きさの知覚に関する論文が上位に来る。`mode` が `llm` か `fallback` かを報告する。

```bash
# 直前の検索結果から graph を作る（search の出力を papers に渡す）
```
→ `citationLinks` が 1 本以上、`clusters` が 2〜8 個。

## 3. UI を確認する（UI を変えた場合）

```bash
npm run dev     # Vite と API を同時起動
```
ブラウザで http://localhost:5173 を開き、変更した操作を実際に行う。ブラウザを操作できない環境では、`npm run build` の成功と API の確認までを行い、UI は未確認と報告する。

## 4. 後片付け

起動したバックグラウンドプロセスを止める（TaskStop）。`.cache/` は残してよい（git 管理外）。

## 報告の仕方

ソースごとの件数・エラー、上位 3 件のタイトル、所要時間を短い表にまとめる。外部 API の 429 / 403 / タイムアウトは「アプリの不具合」と区別して書く。
