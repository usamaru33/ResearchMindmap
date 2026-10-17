---
name: add-paper-source
description: How to add or modify a scholarly database adapter (OpenAlex, Semantic Scholar, Crossref, arXiv, PubMed, IEEE Xplore, DBLP, or a new one) in the ResearchMindmap server — query compilation from the RQL AST, HTTP/rate-limit/cache usage, normalization into the shared Paper type, fixtures and tests, and registry wiring. Use whenever touching server/sources/, adding a database, fixing a source's search results or field mapping, or when a user says "○○も検索対象に", "IEEEの結果がおかしい", "add source".
---

# 論文ソースアダプタの追加・修正

横断検索（DESIGN.md 5 章）は、ソースごとのアダプタを `server/sources/registry.ts` に登録して並列に呼ぶ仕組み。1 ソース = 1 ファイル（`server/sources/<name>.ts`）。

## アダプタの契約

```ts
// server/sources/types.ts
export interface SourceAdapter {
  name: SourceName;                 // shared/types.ts の union に追加する
  label: string;                    // UI 表示名
  status(config: AppConfig): { enabled: boolean; reason?: string };
  search(ast: QueryNode, opts: SourceSearchOptions, ctx: SourceContext): Promise<SourceResult>;
}

export interface SourceResult {
  papers: Paper[];                  // normalize 済み
  total?: number;                   // ソースが返した総件数
  warnings: string[];               // 表現できず近似した条件（日本語で短く）
  approximate: boolean;             // true ならパイプラインがローカル AST 評価で再フィルタする
}
```

`ctx.http`（リトライ・レート制限・キャッシュ込みの fetch）を必ず使い、`fetch` を直接呼ばない。

## 手順

1. **API の実レスポンスを確認する**: `curl` で 2〜3 件取得し、`server/__tests__/fixtures/<name>-search.json`（XML なら `.xml`）として保存する。APIキーが含まれる URL やヘッダーは保存しない
2. **コンパイラを書く**: `compile<Name>(ast, opts) → { url | params, warnings, approximate }` を純粋関数として export する
   - 表現できるもの（ブール・フィールド・年・出版社）は、DESIGN.md 5.3 の対応表に沿ってそのまま変換する
   - 表現できないものは語を緩めて検索し、`approximate: true` と `warnings` を返す。黙って捨てない
   - フィールド名の対応は `shared/query/fields.ts` の正規名（title / abstract / author / venue / keyword / year / publisher / oa / type）を使う
3. **正規化を書く**: `normalize<Name>(raw) → Paper`
   - ID は `shared/ids.ts` の `canonicalId(ids, title, year)` で作る（DESIGN.md 4.2）
   - DOI は小文字化し `https://doi.org/` を除く。arXiv ID は版番号（`v7`）を除く
   - 抄録は HTML タグを除いたプレーンテキストにする（OpenAlex は `abstract_inverted_index` を復元）
   - `publisher` は DOI プレフィックスから推定する（`10.1145` → ACM、`10.1109` → IEEE）
   - `sources: [name]` を必ず入れる。取れない項目は空文字か undefined にし、推測で埋めない
4. **レート制限を設定する**: `server/infra/rateLimit.ts` の設定表にソースを追加する（arXiv は 1 件/3 秒、無キーの S2 は 1 件/秒 など、公式の利用規約を守る）
5. **登録する**: `server/sources/registry.ts` に追加する。キー必須のソースは、キーが無いとき `status()` で `{ enabled: false, reason: '… が未設定' }` を返す
6. **テストを書く**: `server/__tests__/sources/<name>.test.ts`
   - コンパイラ: 代表的な AST（フレーズ、AND/OR/NOT、フィールド、年範囲、出版社）→ 期待するパラメータ
   - 正規化: fixture → `Paper` の主要フィールド（id, title, authors, year, venue, ids.doi, abstract の先頭）
   - ネットワークに出るテストは書かない
7. **ドキュメントを更新する**: DESIGN.md 5.1 の表と 5.3 の対応表、`.env.example`（キーがある場合）、README の「対応データベース」
8. `smoke-test` skill でそのソース単独の実検索を 1 回行い、件数と先頭 3 件のタイトルを確認する

## よくある落とし穴

- OpenAlex: キーなしでは IP 共有の予算を消費する。`per-page` を大きめにして呼び出し回数を減らし、`select=` で必要な項目だけ取る。`search.semantic` は他の search パラメータと併用できない
- arXiv: レスポンスは Atom XML。名前空間つきの要素（`arxiv:doi` など）に注意する。CORS 不可なのでサーバー専用
- Crossref: ブール演算なし → 常に `approximate: true`。`mailto` を設定すると安定する
- Semantic Scholar: 無キーでは 429 が頻発する。失敗しても例外で全体を止めず、`SourceReport.error` に記録する
- DBLP: ボット対策ページ（HTML）が返ることがある。`content-type` を確認し、JSON でなければ失敗扱いにする
