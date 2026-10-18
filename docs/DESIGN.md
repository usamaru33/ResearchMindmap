# Research Mind Map 設計書

- 版: 1.0（2026-10-17）
- 対象リポジトリ: `usamaru33/ResearchMindmap`
- 関連文書: [FEATURES.md](./FEATURES.md)（機能一覧）/ [ROADMAP.md](./ROADMAP.md)（工程表）

---

## 1. 目的とスコープ

既存の「手入力で論文カードを並べるマインドマップ」を、**論文データベースを横断検索して研究領域の地図を自動生成し、そのまま調査・執筆に使えるツール**へ拡張する。

### 1.1 主要要件

| ID | 要件 | 概要 |
|---|---|---|
| R1 | 横断クエリ検索 | ACM DL / IEEE Xplore などで使われる形式のブール検索クエリを入力すると、複数の論文データベースを横断検索し、結果からマインドマップを生成する |
| R2 | なんとなく検索 | 「こういう研究」という自然文の説明から、意味的に近い論文を探してマインドマップを生成する |
| R3 | 研究支援機能 | 研究者・論文執筆者に必要な機能を列挙し（[FEATURES.md](./FEATURES.md)）、優先度順に実装する |

### 1.2 非スコープ（当面やらないこと）

- ユーザー認証・マルチユーザー同期（ローカル単一ユーザー前提）
- 論文PDF本体の保存・全文解析（リンクのみ扱う）
- 利用規約上スクレイピングが許されないサイト（ACM DL・Google Scholar 等）の直接取得

---

## 2. 現状（改変前）の構造

`React 19 + TypeScript + Vite` の SPA。状態は `useReducer`（`src/hooks/useMindMapStore.ts`）、描画は `@xyflow/react`、自動配置は `dagre`。永続化なし・バックエンドなし。論文の引用関係は `Paper.references`（ID配列）が正で、エッジ（`cite-*`）はそこから再生成される派生データ。手動エッジ（`e-*`）は関係種別つき。

既知の不具合（本改修で解消する）:

1. キーボード削除した引用エッジが `rebuildEdges` 時に復活する
2. キーボード削除したノードが他論文の `references` や選択状態から掃除されない
3. TB レイアウトでもハンドルが左右固定
4. `PaperForm` の `setState in effect` が lint エラー
5. リロードでデータが消える

---

## 3. 全体アーキテクチャ

```
┌──────────────────────── Browser (Vite / React) ────────────────────────┐
│  SearchPanel ─┐                                                         │
│  VaguePanel  ─┼─> api client (src/api/*) ──fetch /api/*──┐              │
│  MindMap / DetailPanel / Library / Writing tools         │              │
│  Store (useReducer) <-> persistence (localStorage)       │              │
└──────────────────────────────────────────────────────────┼──────────────┘
                                                           │ (dev: Vite proxy)
┌──────────────────────── API Server (Node / Hono) ────────▼──────────────┐
│  routes/  search, vague, papers, graph, resolve, llm, health           │
│  query/   RQL parser → AST → per-source compilers                      │
│  sources/ openalex, semanticscholar, crossref, arxiv, pubmed,          │
│           ieee(要キー), dblp(ベストエフォート)                            │
│  core/    normalize → dedupe/merge → rank → cluster → graph build      │
│  llm/     Claude（任意。キーが無ければ非LLMフォールバック）               │
│  infra/   http client(retry/backoff), rate limiter, cache(memory+disk) │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 バックエンドを追加する理由

| 理由 | 詳細 |
|---|---|
| CORS | arXiv・DBLP・IEEE はブラウザから直接呼べない（`Access-Control-Allow-Origin` なし） |
| APIキー秘匿 | IEEE / Semantic Scholar / OpenAlex / Anthropic のキーをブラウザに出さない |
| レート制御・キャッシュ | 無料枠（OpenAlex は無キーで共有 $0.10/日）を節約するため、サーバー側でキャッシュ・直列化する |
| LLM | Claude API 呼び出しはサーバー側で行う |

### 3.2 技術選定

| 項目 | 採用 | 理由 |
|---|---|---|
| サーバー | Hono + `@hono/node-server` | 軽量・TypeScript 親和性・Web 標準 Request/Response |
| 実行 | `tsx`（開発）/ `tsc` ビルド（本番） | 追加ビルド設定が最小 |
| 型共有 | `shared/` ディレクトリ | フロントとサーバーで `Paper` 等を共通化 |
| 検証 | `zod` | API 入力検証と LLM 構造化出力の両方に使う |
| テスト | Vitest | Vite と設定共有、ESM/TS をそのまま実行 |
| 同時起動 | `concurrently` | `npm run dev` で Vite と API を同時起動 |
| LLM | `@anthropic-ai/sdk`、モデル `claude-opus-5-5` | 構造化出力（`messages.parse` + zod）とストリーミングを使用 |

### 3.3 ディレクトリ構成（改変後）

```
shared/                 フロント・サーバー共通の型と純粋関数
  types.ts              Paper, SearchRequest/Response, Graph など
  query/                RQL パーサー（純粋関数。フロントでも構文チェックに使う）
server/
  index.ts              Hono アプリ起動
  app.ts                ルーティング組み立て（テストから import 可能）
  config.ts             環境変数の読み込み
  routes/*.ts
  sources/<name>.ts     ソースアダプタ（1 ソース 1 ファイル）
  sources/registry.ts
  core/                 normalize / dedupe / rank / cluster / graph
  llm/                  Claude クライアント、プロンプト、フォールバック
  infra/                http / cache / rateLimit
  __tests__/ fixtures/
src/
  api/                  サーバー呼び出しクライアント
  components/           既存 + SearchPanel, VagueSearchPanel, Library, …
  hooks/ store/ utils/
docs/                   設計書・機能一覧・工程表
.claude/skills/         このプロジェクト用の Claude Code skills
```

---

## 4. データモデル

### 4.1 Paper（拡張）

既存フィールドを壊さずに追加する（既存の手入力論文・サンプルデータはそのまま有効）。

```ts
interface Paper {
  id: string;                 // 正規化ID（4.2）
  title: string;
  authors: string[];
  belongs: string;            // 所属（取得できなければ空）
  year: number;
  venue: string;
  abstract: string;
  challenges: string;
  futureWork: string;
  references: string[];       // マップ内の論文IDのみ（既存仕様を維持）
  thumbnailUrl?: string;
  // ---- 追加 ----
  ids?: ExternalIds;          // { doi, arxiv, openalex, s2, pmid, dblp, ieee }
  url?: string;               // ランディングページ
  pdfUrl?: string;            // OA PDF
  citationCount?: number;
  referenceIds?: string[];    // マップ外も含む外部ID（OpenAlex W-ID 等）
  topics?: Topic[];           // { id, name, level: 'topic'|'subfield'|'field', score }
  keywords?: string[];
  publisher?: string;         // 'ACM' | 'IEEE' | …（DOI プレフィックスから推定）
  type?: string;              // article / proceedings-article / preprint …
  sources?: SourceName[];     // どのデータベースで見つかったか
  relevance?: number;         // 検索スコア（0–1 に正規化）
  // 読書管理（F8）
  status?: 'unread' | 'reading' | 'read' | 'skipped';
  tags?: string[];
  notes?: string;
  rating?: 0 | 1 | 2 | 3 | 4 | 5;
  screening?: { decision: 'include' | 'exclude' | 'maybe'; reason?: string };
  addedAt?: string;
}
```

### 4.2 ID 正規化と重複統合

- 優先順位: `doi:<小文字DOI>` > `arxiv:<版番号なしID>` > `openalex:W…` > `s2:<paperId>` > `pmid:<id>` > `title:<正規化タイトル>:<year>`
- 統合（dedupe）条件: いずれかの外部IDが一致、またはタイトルの正規化文字列（小文字化・記号除去・空白圧縮）が一致し年差が 1 以内
- 統合時のフィールド選択: 抄録は最長のもの、被引用数は最大値、`sources` は和集合、`ids` はマージ
- 目録の誤りへの備え: マップの論文と ID が一致しても題名が大きく違う（語の Jaccard 0.5 未満）記録は、空の欄を埋めるだけにする。arXiv ID の照会で OpenAlex が arXiv 以外の DOI の記録を返し、題名が arXiv API と合わない（0.6 未満）ときは arXiv の記録を使う

### 4.3 マップ要素

| ノード種別 | 用途 |
|---|---|
| `paper` | 論文カード（既存） |
| `query` | 検索クエリ（マップの根。1 マップに 0〜1 個） |
| `cluster` | トピッククラスタ（OpenAlex の topic/subfield、または LLM 命名） |
| `note` | 付箋（利用者のメモ。自動配置では動かさない。13.8） |

| エッジ種別 | ID 形式 | 意味 |
|---|---|---|
| 引用 | `cite-<ref>-<paper>` | `Paper.references` から派生（既存） |
| 手動 | `e-<uuid>` | 利用者が作る関係（既存） |
| 所属 | `grp-<cluster>-<paper>` | クラスタ → 論文 |
| 根 | `root-<cluster>` | クエリ → クラスタ |

`grp-*` / `root-*` は検索結果から生成し、引用エッジと同様に派生データとして再生成可能にする。

### 4.4 プロジェクト（永続化）

```ts
interface Project {
  id: string; name: string; createdAt: string; updatedAt: string;
  nodes: MapNode[]; edges: MapEdge[]; layoutDirection: 'TB' | 'LR';
  searchHistory: SearchHistoryEntry[];
  schemaVersion: number;
}
```

- `localStorage` にプロジェクト一覧と各プロジェクトを保存（キー `rmm:v1:*`）。変更は 500ms デバウンスで保存
- JSON エクスポート/インポートでバックアップ・共有
- `schemaVersion` で将来のマイグレーションに備える

---

## 5. 横断クエリ検索（R1）

### 5.1 対応データベース

| ソース | 取得方法 | キー | 主な用途 | 備考 |
|---|---|---|---|---|
| OpenAlex | REST | 任意（推奨） | **基幹**。ACM・IEEE を含む全分野、引用関係、トピック、セマンティック検索 | 無キーは IP 共有で $0.10/日。キーで $1/日 |
| Semantic Scholar | Graph API | 任意（推奨） | 関連度検索、推薦、TLDR | 無キーは共有レート制限で 429 が多い |
| Crossref | REST | 不要 | DOI メタデータ網羅、出版社フィルタ | `mailto` 指定で polite pool |
| arXiv | Atom API | 不要 | プレプリント | CORS 不可 → サーバー経由必須。3 秒間隔を守る |
| PubMed | E-utilities | 任意 | 医学・生命科学 | |
| IEEE Xplore | REST | **必須** | IEEE 文献の公式検索 | キーが無ければ無効化し、OpenAlex/Crossref の IEEE 絞り込みで代替 |
| DBLP | search API | 不要 | 計算機科学の会議録 | ボット対策で弾かれることがあるため、ベストエフォート（失敗しても全体は継続） |
| ACM DL | — | — | 公開 API なし | **OpenAlex / Crossref の DOI プレフィックス `10.1145` 絞り込みで代替**（`publisher:acm`） |

### 5.2 クエリ言語 RQL（Research Query Language）

ACM DL / IEEE Xplore / Scopus / Web of Science / PubMed の書き方を受け付け、一つの AST に変換する（実装: `shared/query/`）。

```
query    := orExpr
orExpr   := andExpr ( OR andExpr )*
andExpr  := notExpr ( [AND] notExpr )*        // 演算子なしの並びは AND
notExpr  := NOT notExpr | primary
primary  := ( '(' orExpr ')' | field operand | term ) [ '[' tag ']' ]
field    := NAME ':' | NAME '=' | '"Quoted Name"' ':' | NAME '('   // 例: title: / TI= / "Document Title": / TITLE-ABS-KEY(
term     := WORD | WORD* | "PHRASE"
```

| 書き方 | 意味 | 受け付ける別名 |
|---|---|---|
| `"graph neural network"` | フレーズ（“ ” も可） | |
| `AND` `OR` `NOT` | 論理演算（**大文字のみ**。`&&` `\|\|` `-語` `!語` も可）。優先順位は NOT > AND > OR | `ANDNOT` |
| `title:transformer` | タイトル | `ti:` `TI=` `"Document Title":` `Title:(…)` `[ti]` |
| `abstract:` | 抄録 | `ab:` `abs:` `AB=` `Abstract:(…)` |
| `tiab:` | タイトル + 抄録 + キーワード | `TITLE-ABS-KEY(…)` `[tiab]` `"Title/Abstract":` |
| `author:"Hinton"` | 著者 | `au:` `AU=` `auth` `"Authors":` `[au]` |
| `venue:CHI` | 会議・論文誌名 | `so:` `SO=` `srctitle` `"Publication Title":` `[ta]` |
| `keyword:` | キーワード | `kw:` `KEY=` `"Author Keywords":` `"Index Terms":` `[mh]` |
| `all:` | 全項目（既定） | `AllField:` `"All Metadata":` `TS=` `[all]` |
| `year:2019..2024` | 年（`2020` / `2019-2024` / `>=2020` / `<2010` / `2015..` も可） | `PY=` `PUBYEAR > 2019` `[dp]` |
| `publisher:acm` | 出版社（DOI プレフィックス。acm, ieee, springer, elsevier, …） | `publisher:(acm OR ieee)` |
| `oa:true` | オープンアクセスのみ | |
| `type:article` / `lang:en` | 種別 / 言語 | `[pt]` / `[la]` |
| `vir*` | 前方一致ワイルドカード | |

補足:

- フィールドは**直後の 1 項**にだけ掛かる（`title:deep learning` = `title:deep AND learning`）。複数語に掛けるときは括弧かフレーズを使う
- 引用符で囲まない `a` `the` `of` `and` などのストップワードは捨てる（各データベースも無視するため）
- フィルタ（year / publisher / oa / type / lang）は、AND でつないだ**最上位**にだけ置ける。同じフィルタを複数書くと、publisher 等は OR、year は範囲の共通部分になる
- 構文エラーは文字位置（`start`/`end`）つきで返す。不明なタグ `[xx]` は警告にして無視する
- `formatQuery()` で正規化したクエリ文字列に戻せる（キャッシュキーや UI 表示に使う）
- `matchesQuery()` で論文メタデータに対して AST を評価できる（近似検索しかできないソースの結果を絞り込むのに使う。簡易ステミング・アクセント無視）

### 5.3 ソース別コンパイル

各アダプタは `compile(ast) → { request, unsupported[] }` を実装する。表現できない部分は **(a) 緩めて検索し、(b) 取得後にローカル評価器で AST を再評価して絞り込む**。例えば Crossref はブール演算を持たないので、AND/OR の語を全部並べて検索し、取得後に AST で判定する。表現できなかった部分は `warnings` として UI に表示する。

| 機能 | OpenAlex | S2 | Crossref | arXiv | PubMed | IEEE |
|---|---|---|---|---|---|---|
| ブール | ◎ `search=` | ○ bulk `+ \| -` | × → ローカル | ◎ `AND/OR/ANDNOT` | ◎ | ◎ |
| フィールド | ○ `search.title` 等 | × | △ `query.author` | ◎ `ti/au/abs` | ◎ `[ti]` | ◎ |
| 年 | ◎ filter | ◎ `year=` | ◎ filter | △ submittedDate | ◎ `[dp]` | ◎ |
| 出版社 | △ IEEE のみ host organization | × | ◎ `prefix:` | × | × | 常に IEEE |

実装で分かったこと（2.3）:

- OpenAlex の ACM 会議録（CHI 等）は出版社（host organization）が空のことが多い。そこで `publisher:acm` は OpenAlex 側で絞り込まず多めに取得し、DOI プレフィックスで手元で絞り込む。網羅性は Crossref の `prefix:10.1145` で補う
- OpenAlex は掲載先名でも絞り込めないため、`venue:` も手元で絞り込む。著者は `raw_author_name.search` フィルタを使う
- 近似検索になるソース（`approximate: true`）は指定件数の 2 倍を取得してから絞り込む

### 5.4 検索パイプライン

```
RQL → parse → AST
   → [各ソースで並列: compile → fetch(retry, rate limit, cache) → normalize]   ※失敗したソースは記録して続行
   → 重複統合 + 順位付け（RRF）
   → OpenAlex で補完（DOI で一括取得：抄録・トピック・参考文献・被引用数）
   → 再判定: AST 全体を評価できたソースが返した論文はフィルタだけ確認し、
             近似ソースだけが返した論文は（補完済みの）メタデータで AST 全体を再評価
   → 上位 N 件を返す
```

補完を再判定より前に行うのは、Crossref などは抄録を持たないことが多く、抄録にしか出てこない語で誤って落としてしまうため（実装: `server/core/search.ts`）。

- **RRF**（Reciprocal Rank Fusion）: `score = Σ_s 1/(k + rank_s)`（k=60）。スコア形式がバラバラなソースを公平に統合できる
- ソースごとのタイムアウトは 15 秒。失敗したソースは `perSource[].error` に記録し、他ソースの結果は返す
- 1 回の検索で各ソースから最大 50 件（設定可能）

### 5.5 検索結果からのマインドマップ生成

1. 利用者は結果一覧でチェックを付ける（既定はすべて）。生成先は「新しいプロジェクト」か「今のマップに追加」
2. `POST /api/graph/build` で次を作る（実装: `server/core/graph.ts`）
   - **引用関係**: OpenAlex の `referenced_works` 同士の交差。各論文の `references` に、マップ内で引用している論文の ID を入れて返す（引用エッジは既存どおり `references` から派生）
   - **クラスタ**: 次の 2 方式を両方計算し、点数の高い方を採用する
     - トピック階層: OpenAlex の primary topic → subfield → field → domain の順に、少数（≤ 8）の大きなグループに収まる最も細かい階層
     - ファセット: 各論文のトピック名とキーワードのうち、まだ割り当てていない論文を最も多く含むものを順に選ぶ（貪欲法）。全体の 45% 以上が持つ語（多くはクエリそのもの、例: "virtual reality"）と arXiv の分類コード（cs.HC 等）は使わない
     - 点数 = 被覆率 ×（最大グループの割合が 45% を超えた分の減点）×（グループ数の加点）。実データでは、トピック階層だと 1 つのトピックに 60 件中 52 件が集まって役に立たないことがあり、ファセット方式が 7 グループに分けた
   - LLM が使えるときは、後の工程（4.9）でクラスタ名を付け直す
3. フロントで「クエリ（根）→ クラスタ → 論文」のノードと構造エッジ（`root-*` / `grp-*`）を作り、`IMPORT_GRAPH` で取り込む。既にある論文は、利用者が書いた項目（メモ・タグ・状態など）と引用を残したまま、メタデータだけ更新する
4. **マインドマップ配置**（`src/utils/mindMapLayout.ts`）: 根を中央に置き、クラスタを左右の高さが釣り合うように振り分け、各クラスタの論文を外側に列（1 列最大 7 件）で並べる。左側のノードはハンドルの向きも反転する。木に属さない論文（手で追加したもの）は木の下に dagre で並べる
5. Toolbar の「Citations」で引用エッジの表示を切り替えられる（論文数が多いと引用の線が密になるため）

## 6. なんとなく検索（R2）

### 6.1 方針

自然文（日本語可）の「こういう研究」から、次の 3 経路で候補を集めて統合する。

| 経路 | 内容 | LLM 必須 |
|---|---|---|
| A. 埋め込み検索 | OpenAlex `search.semantic`（GTE-Large の埋め込みによる意味検索。最大 50 件、最大 2,000 文字） | 不要 |
| B. クエリ展開 | Claude が説明文から (1) 英語の要約説明 (2) 3〜5 本の RQL クエリ (3) 同義語・関連概念を構造化出力で生成し、横断検索（5 章）にかける | 必要（無ければキーワード抽出で代替） |
| C. 関連度検索 | Semantic Scholar の関連度検索に英語化した説明文を投げる | 不要 |

日本語入力の扱い: OpenAlex の埋め込みは英語モデルのため、LLM があれば先に英訳する。LLM が無い場合はそのまま投げる（精度は下がる旨を UI で表示する）。

### 6.2 再ランキング

1. 経路 A/B/C の順位を RRF で融合
2. 上位 60 件について、説明文との近さを再計算する
   - LLM あり: Claude にタイトルと抄録を渡し、関連度 0–3 と一言の理由を構造化出力させる（理由は UI に「なぜこの論文か」として表示）
   - LLM なし: 説明文から抽出した語との BM25 類似度
3. 最終スコア = 0.6·再ランキング + 0.3·RRF + 0.1·log(被引用数)

### 6.3 出力

結果一覧と同時に「展開されたクエリ」を表示し、ワンクリックで通常の RQL 検索へ移って絞り込めるようにする（なんとなく → 厳密検索への橋渡し）。マップ生成は 5.5 と同じで、根ノードは「なんとなく検索」と表示する。

### 6.4 実装メモ（3.2）

- 実装: `server/core/vague.ts`（外部呼び出しはすべて差し替え可能にしてテスト）
- 統合の重み: 意味検索 2、各検索式 1、S2 1（意味検索が最も主題に沿うため）
- arXiv は 1 回 3 秒の間隔が必要なので、最も具体的な 1 本目の検索式でだけ使う
- LLM の関連度判定で 0（無関係）と判定された論文は結果から除く。LLM の出力が候補の半分以上を評価していなければ、信用せず BM25 に切り替える
- LLM が作った検索式は RQL パーサーで検査し、構文の誤りがあるものは使わない
- **LLM なしの実測**（OpenAlex 意味検索 + キーワード検索式 + BM25）: 英語の説明「Does changing the size of my virtual body in VR change how large I perceive objects around me?」では、上位が "Effects on Size Perception by Changing Dynamic Invisible Body Size"、"Virtual Hand Realism Affects Object Size Perception in Body-Based Scaling" など主題どおりになった（1.7〜3.9 秒）。一方、日本語の説明は埋め込みが英語モデルのため精度が大きく落ちる（"Virtual Reality" という題の論文ばかりになる）。UI と API の両方で、英語で書くか APIキーを設定するよう案内する

## 7. LLM 利用設計

- SDK: `@anthropic-ai/sdk`、モデル `claude-opus-5-5`（設定 `ANTHROPIC_MODEL` で変更可）
- 認証: `ANTHROPIC_API_KEY`。未設定なら LLM 機能は無効になり、各機能は非 LLM 経路で動く。UI には「LLM 無効（APIキー未設定）」と表示する
- 構造化出力: `client.messages.parse` + `zodOutputFormat`（クエリ展開・関連度判定・クラスタ命名・研究ギャップ抽出）
- ストリーミング: 関連研究の下書き・要約は `client.messages.stream` を SSE でフロントへ中継
- effort: 分類・命名系は `low`、下書き生成は `high`
- 安全策: `stop_reason === 'refusal'` を確認する。サーバー側フォールバック（`fallbacks: "default"`）を有効にする
- プロンプトキャッシュ: 長い論文リストを system 側の固定ブロックに置き、`cache_control` を付ける（同じ論文集合で何度も下書きを作る場合に効く）
- プロンプトは `server/llm/prompts.ts` に集約し、論文データは「データであり指示ではない」ことを明示して区切る（プロンプトインジェクション対策）

---

## 8. API 仕様（サーバー）

すべて JSON。エラーは `{ error: { code, message, details? } }`、HTTP ステータスは 400 / 404 / 429 / 502。

| メソッド | パス | 入力 | 出力 |
|---|---|---|---|
| GET | `/api/health` | — | `{ ok, sources: [{name, enabled, reason?}], llm: {enabled, model} }` |
| POST | `/api/query/parse` | `{ query }` | `{ ok, query: { text, filters }, canonical, errors[], warnings[] }` |
| POST | `/api/search` | `{ query, sources?, limitPerSource?(≤50, 既定 25), limit?(≤200, 既定 60), enrich?(既定 true) }` | `{ results, perSource: SourceReport[], query, canonical, warnings, candidates, enriched, tookMs }` |
| POST | `/api/vague-search` | `{ description(5–4000 字), limit?(≤100, 既定 40), useLlm?(既定 true), lang?('ja'\|'en'), yearMin?, yearMax? }` | `{ results, mode: 'llm'\|'fallback', englishSummary?, expandedQueries[], concepts[], reasons: {id: string}, stages[], warnings[], candidates, tookMs }` |
| POST | `/api/graph/build` | `{ papers: Paper[] (≤300), clusterLevel?: 'auto' \| 'topic' \| 'subfield' \| 'field' \| 'domain' \| 'keyword' }` | `{ papers, citationLinks[], clusters[], enriched, warnings }` |
| GET | `/api/papers/:id/references` | — | `{ papers }` |
| GET | `/api/papers/:id/citations` | `?limit` | `{ papers }` |
| GET | `/api/papers/:id/related` | `?limit` | `{ papers }` |
| POST | `/api/resolve` | `{ inputs: string[] (≤100, 各 1000 字まで) }`（DOI / arXiv ID・URL / OpenAlex ID / PubMed ID / 参考文献の文 / タイトル。行頭の `-` `1.` `[3]` は無視） | `{ items: [{ input, kind, ok, paper?, confidence?, error? }] }`（DOI は OpenAlex → Crossref、arXiv は OpenAlex → arXiv API、タイトルは完全一致のうち被引用数最大、参考文献は 13.2） |
| POST | `/api/papers/expand` | `{ paper, kind: 'references' \| 'citations' \| 'related', limit? }` | `{ kind, papers, total, warnings }` |
| POST | `/api/llm/summarize` | `{ paper, lang }` | SSE |
| POST | `/api/llm/related-work` | `{ papers, topic, style, lang }` | SSE |
| POST | `/api/llm/gaps` | `{ papers }` | `{ gaps: [{title, evidence[], paperIds[]}] }` |
| POST | `/api/papers/recommend` | `{ seeds: [{ id, ids }], exclude: openalexId[], limit? }` | `{ papers, reasons: {id: {cocited, citing, related}}, seeds, candidates }` |
| POST | `/api/explore/search` | `{ kind: 'author' \| 'venue', query }` | `{ entities: ExploreEntity[] }` |
| POST | `/api/explore/works` | `{ kind, id, limit?, sort?: 'cited' \| 'recent', yearMin?, yearMax? }` | `{ papers, total, byYear }` |
| POST | `/api/papers/check` | `{ papers: [{ id, title, year, type?, ids? }] (≤300) }` | `{ retracted: id[], published: { [id]: Paper }, checked: { retraction, preprints, preprintTotal }, failed: ('retraction' \| 'published')[] }` |
| POST | `/api/trends` | `{ queries: string[] (1–5), yearMin?(既定 終了年 − 19), yearMax?(既定 今年), share?(既定 true) }` | `{ series: [{ query, byYear, total, approximate, error?: 'invalid_query' \| 'upstream' }], all?: byYear, yearMin, yearMax }` |

### 8.1 設定（`.env`）

```
PORT=8787
OPENALEX_API_KEY=          # 任意
SEMANTIC_SCHOLAR_API_KEY=  # 任意
IEEE_API_KEY=              # 任意（無いと IEEE ソースは無効）
NCBI_API_KEY=              # 任意
CROSSREF_MAILTO=           # 任意（polite pool 用の連絡先）
ANTHROPIC_API_KEY=         # 任意（無いと LLM 機能は無効）
ANTHROPIC_MODEL=claude-opus-5-5
CACHE_DIR=.cache           # ディスクキャッシュ
CACHE_TTL_HOURS=72
```

`.env` は git 管理外。`.env.example` を提供する。

### 8.2 著者・会議から探す

- OpenAlex の `/authors` と `/sources` を名前で検索し、所属・論文数・被引用数・h 指数・主な分野を候補として出す。同名の別人や表記ゆれは候補を選ぶことで区別する
- 論文一覧は `authorships.author.id` または `primary_location.source.id` で絞り、被引用数順か新しい順に最大 200 件。年ごとの論文数は `group_by=publication_year` で全件分を取る（失敗しても一覧は返す）
- 研究の流れ: 取得した一覧を年で 4 期間ほどに分け、各期間に多い topic を並べる（`src/utils/researchFlow.ts`）
- 共著ネットワーク: 著者を「姓 + 名の頭文字」で同一視し（`Vaswani, A.` = `Ashish Vaswani`）、論文数上位 30 人と共著関係を描く。著者が 25 人を超える論文と "et al." は数えない。配置は決定的な力学モデル（`src/utils/forceLayout.ts`）。一覧かマップ全体を対象に選べ、ノードをクリックするとその人を探す
- 結果は通常の検索結果と同じくマップにでき、ルートは `author:"名前"` / `venue:"名前"` になる

### 8.2.1 おすすめ（A8）

- もとにする論文（マップ全体か、ライブラリで選んだ論文。DOI・arXiv ID・OpenAlex ID があるもののうち、評価・読書状況・被引用数の高い最大 100 件）の `referenced_works` と `related_works` を OpenAlex から 50 件ずつまとめて取る
- 後ろ向き: もとの論文の何件が引用しているか（共引用）。前向き: `cites:` の OR フィルタで被引用数の多い 100 件を取り、それぞれがもとの論文を何件引用しているか。関連: OpenAlex の related_works に何件で挙がるか（重み 0.5）
- 合計で順位付けし、もとの論文が 3 件以上なら 1.5 未満（1 件とだけつながる候補）を落とす。前向きの取得に失敗しても残りで返す
- マップにある論文は、サーバーでは OpenAlex ID で、画面では DOI・arXiv ID・題名の一致（`matchExisting`）でも除く
- 理由（「もとの論文 3 件が引用」など）を結果に添え、既定で「このマップに追加」にする

### 8.2.2 新着アラート（A11）

- 対象は保存（★）したクエリ検索。検索を実行するたびに、結果のキー（id・`doi:`・`openalex:`）を履歴の `seen` に足す（新しい順・最大 1000）
- 確認では保存したクエリに `year:>=昨年` を付けて検索し、`seen` にない論文を新着とする。新着は件数バッジ（履歴と Toolbar の検索ボタン）で示し、一覧からマップに追加できる。「既読にする」で `seen` に入れる
- 機能追加前に保存した検索（`seen` なし）は、初回の確認結果を基準にする
- 定期実行はしない。プロジェクトを開いたとき（設定で切替、各検索 1 日 1 回まで）と「新着を確認」を押したときに確認する

### 8.3 画面の設定（ブラウザ）

⚙ ボタンの設定画面で、各ソースと LLM の状態（`/api/health`）を確認し、次の既定値を変える。`localStorage` の `rmm:v1:settings` に保存し、壊れた値や範囲外の値は既定値に戻す。APIキーはここでは扱わない。

| 項目 | 既定値 | 使う場所 |
|---|---|---|
| 使うデータベース（除外リスト） | すべて | クエリ検索のソース選択の初期状態 |
| 1 データベースあたりの件数 | 25 | クエリ検索 |
| なんとなく検索の件数 | 40 | なんとなく検索 |
| Claude を使う | オン | なんとなく検索・要約・下書き・ギャップ・比較表・クラスタ名（`useLlm`） |
| AI が書く文章の言語 | 日本語 | 上記の `lang` |
| 起動時に新着を確認 | オン | 保存した検索の新着アラート（8.2.2） |
| 表示言語 | ブラウザの言語（日本語 / 英語、どちらでもなければ日本語） | UI 全体 |

検索パネルで直接切り替えた値はその場だけ優先し、触っていない間は設定に従う。

### 8.4 UI の言語（日本語 / 英語）

- 文言は `src/i18n/messages/*.ts` に `キー: [日本語, 英語]` で置き、`MESSAGES` に集める。キーは型で縛られ、テストで両言語がそろっていること・プレースホルダが一致することを確かめる
- 置き換え: `{name}` と英語の複数形 `{n|paper|papers}`
- コンポーネントは `useT()`（設定の `uiLanguage` に追従）、React 外のコード（API クライアント・ストア・書き出し）は `tr()`（`src/i18n/current.ts`、設定画面が言語を反映する）
- サーバーが返す状態の理由は `reason`（日本語）と `reasonEn`（英語）を持ち、`localizedReason()` で選ぶ
- 翻訳しないもの: 論文の内容、ユーザーが入力・保存した値（タグ・比較表の観点・除外理由など。選択肢は表示言語で出し、選んだ文字列をそのまま保存する）、書き出す文書（PRISMA 集計・ギャップの Markdown）、クエリのパースエラーと検索 API の警告（サーバー側の日本語のまま）

---

## 9. 横断的関心事

| 項目 | 方針 |
|---|---|
| レート制限 | ソースごとのトークンバケット（arXiv 1 req/3s、OpenAlex セマンティック 1 req/s、S2 無キー 1 req/s） |
| リトライ | 429 / 5xx / ネットワークエラーを指数バックオフで最大 3 回。`Retry-After` を尊重する |
| キャッシュ | リクエスト URL のハッシュをキーに、メモリ LRU（500 件）とディスク（`CACHE_DIR`、TTL 72h） |
| ログ | ソース名・所要時間・件数・キャッシュヒットを 1 行で出す |
| セキュリティ | キーはサーバーのみで保持し、レスポンスに含めない。外部 HTML は描画しない（抄録はプレーンテキスト化） |
| 性能 | 横断検索の目標は p50 5 秒以内（キャッシュヒット時 0.5 秒以内）。マップ 300 ノードまで快適に操作できること |
| アクセシビリティ | ボタンにラベル、キーボード操作、色だけに頼らない（年はバッジの文字でも示す） |

---

## 10. フロントエンド設計

### 10.1 画面構成

```
┌ Header: プロジェクト切替 / 検索モード [クエリ | なんとなく] / 設定 ┐
├──────────┬───────────────────────────────┬────────────────┤
│ 左パネル  │ MindMap                        │ 右パネル        │
│ ・検索    │  (query → cluster → paper)     │ ・論文詳細      │
│ ・結果一覧 │  Toolbar: 配置/方向/表示切替    │ ・ノート/タグ   │
│ ・ライブラリ│  フィルタバー                   │ ・引用展開       │
│ ・追加/編集 │                               │ ・執筆支援       │
└──────────┴───────────────────────────────┴────────────────┘
```

- 左パネルはタブ（Search / Library / Add）。既存の `Sidebar` を拡張する
- 状態管理は既存の reducer を拡張する（Zustand 等は導入しない。規模的に不要）
- reducer の不整合を解消するため、React Flow の削除イベントは `onNodesDelete` / `onEdgesDelete` で受けて `DELETE_PAPER` / `REMOVE_CONNECTION`（引用エッジなら `references` も更新）に変換する

### 10.2 store の拡張

- 状態に `projects`, `activeProjectId`, `search: { mode, status, results, reports }`, `ui: { colorMode, filters }` を追加
- 既存のアクションは維持し、`MERGE_PAPERS`（検索結果の取り込み・重複統合）、`SET_CLUSTERS`、`UPDATE_PAPER_META`（ノート・タグ等）などを追加
- reducer は純粋関数として分離し、Vitest で単体テストする

---

## 11. テスト戦略

| レベル | 対象 | 手段 |
|---|---|---|
| 単体 | RQL パーサー、各ソースのコンパイラ、正規化・重複統合・RRF・BM25、reducer、BibTeX 入出力 | Vitest |
| アダプタ | 実 API のレスポンスを `server/__tests__/fixtures/` に保存し、ネットワークなしで normalize を検証 | Vitest |
| API | `app.request()` で Hono を直接叩く（外部呼び出しはモック） | Vitest |
| スモーク | 実サーバーを起動し、`/api/health` と少数の実クエリを確認（キャッシュ有効） | skill `smoke-test` |
| UI | ビルド成功・lint・手動確認（主要フローはブラウザで確認） | `npm run build` / `npm run lint` |

各 PR のマージ条件: `npm run lint` / `npm test` / `npm run build` がすべて成功していること。

---

## 12. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| OpenAlex 無キーの共有予算（$0.10/日）を使い切る | 検索不能 | ディスクキャッシュ、`per-page=50` 程度にまとめる、キー設定を README で案内、Crossref/arXiv へ自動フォールバック |
| S2 無キーの 429 | 結果が減る | バックオフ、失敗しても他ソースで継続、キー設定を案内 |
| IEEE キーなし | IEEE 公式検索不可 | `publisher:ieee` で OpenAlex/Crossref から IEEE 文献を取得 |
| DBLP のボット対策 | 取得失敗 | ベストエフォート扱い（既定で無効、設定で有効化） |
| LLM キーなし | なんとなく検索の精度低下、執筆支援が使えない | 埋め込み検索（OpenAlex）と BM25 で代替。執筆支援はテンプレート出力に退避 |
| 外部 API の仕様変更 | アダプタ破損 | fixture テスト、アダプタを 1 ファイルずつに分離 |

---

## 13. 追加機能（M5）

### 13.1 原稿の引用チェック（D7）

- 執筆支援パネル（旧「関連研究の下書き」）のタブ「引用チェック」。原稿（LaTeX / Markdown）を貼るか `.tex` / `.md` を読み込む。原稿は保存しない（画面を閉じると消える）
- 読み取る引用: `\cite{a,b}` 系（`\citep` `\citet` `\parencite` `\textcite` `\autocite` `\nocite` など、`*` と `[前][後]` の引数つきも）、Pandoc の `[@a; @b, p. 3]` と `@a`。`%` 以降の LaTeX コメントは読まない
- 引用キーは、BibTeX から取り込んだ論文は元のキー（`Paper.citeKey`）、それ以外は D1 と同じ規則（`vaswani2017attention`）。元のキーと重ならないように生成する
- 結果: 引用した論文と回数（最初に出る行）、マップにないキー（似たキーの候補つき）、マップにあるが引用していない論文。引用した論文だけの `.bib` を出せる（キーは原稿と同じ）。原稿が空のときは、マップの論文の引用キーの一覧（押すと `\cite{キー}` をコピー）になる

### 13.2 参考文献リストの取り込み（A13）

- 「論文を追加」に「参考文献リスト」タブを足す。貼り付けた文を `[1]` / `1.` / 空行 / 行頭の著者名（APA）で 1 件ずつに分け、PDF のコピーで入る行の途中の改行・ハイフン区切りをつなぐ（`src/utils/referenceList.ts`）
- `/api/resolve` に種別 `citation` を足す（年があり、句読点が 3 つ以上ある 30 字以上の行）。題名を推定し（引用符の中 / `(2016).` や `2016.` の後の文 / Vancouver 形式の著者の後 / 名前の列でない最長の文）、OpenAlex の題名検索 → Crossref の `query.bibliographic` → 2 つ目の推定題名の順に候補を集める（確かな一致が出たら止める）
- 候補の判定（`server/core/citation.ts`）: 候補の題名の語の 85% 以上が参考文献に含まれ（3 語以上）、年（±1）と筆頭著者の姓がどちらも合えば high、片方なら low、どちらも合わなければ不採用。Crossref で見つかったものは DOI で OpenAlex から引き直す
- DOI や arXiv ID を含む参考文献はその ID で引くが、記録の題名が参考文献と合わなければ次の取得元（Crossref / arXiv API）、それでもだめなら文から探す（OpenAlex の記録が別の論文の題名になっていることがある）
- 照合の確からしさ（`confidence`: high / low）を返し、低いものは画面で確認を促す（既定で取り込みの対象から外す）

### 13.3 文献チェック（B9）

| 項目 | 判定 | 対処 |
|---|---|---|
| 撤回 | OpenAlex の `is_retracted`（DOI / OpenAlex ID で 50 件ずつ） | タグ「retracted」を付ける / 削除 |
| 公開版のあるプレプリント | 種類が preprint か arXiv だけの論文を、題名（類似度 0.9 以上）・年（同じか後）で検索し、preprint 以外のもの | 公開版の書誌（DOI・掲載先・年・種類）に置き換える。メモ・タグ・評価などは残す |
| 重複 | マップ内で DOI・arXiv ID・正規化題名が一致する別ノード | 1 つに統合（`MERGE_PAPERS`） |
| 書誌の欠け | 年・著者・掲載先・抄録・DOI のない論文 | 詳細パネルで編集 |

- ライブラリのタブ「文献チェック」。撤回・公開版は「OpenAlex で確認」を押したときだけ調べる（無料枠を使うため）。重複と欠けはその場で出す
- サーバー側（撤回・公開版）は `/api/papers/check`（最大 300 件）。撤回は `is_retracted:true` を OpenAlex ID / DOI の OR フィルタ（50 件ずつ）で、公開版は `search.title` + `type:!preprint` で探し、題名の類似度 0.9 以上・筆頭著者の姓が一致・年が 1 年以上前でない・arXiv 以外の DOI を持つものを選ぶ。公開版の検索は 1 回 30 件まで。片方が失敗しても他方は返し、失敗した項目を `failed` で伝える（文言は画面側で表示言語にする）
- 重複のどれを残すかは、書誌の埋まり具合・メモ・タグ・評価・引用の多いものを既定にし、画面で選び直せる
- `MERGE_PAPERS { keepId, mergeIds }`: 残す論文に書誌（空の欄・ID・タグの和・長いメモ）を足し、消す論文を指す `references` と手動エッジを残す論文へ付け替え、自己参照と重複エッジを除く。元に戻せる

### 13.4 タグの管理（B10）

- ライブラリのタブ「タグ」で、タグごとの件数と、名前の変更・既存タグへの統合（同じ名前に変えると統合）・削除をする。`RENAME_TAG { from, to | null }` は 1 回の操作として元に戻せる。タグを押すと、そのタグで絞り込んだ一覧に移る

### 13.5 分析パネル（C9, C10）

- Toolbar に「分析」を足し、タブ「このマップ」と「研究動向」を持つ
- このマップ: 論文数・読了率・OA の割合・被引用数の中央値、年ごとの件数、掲載先・著者（8.2 と同じ同一視）・タグ・出版社の上位、読書状況・スクリーニングの内訳、被引用数の上位。項目を押すとマップのフィルタ（C3）にその語を入れる（著者は姓、年は数字。フィルタは出版社と年も対象にした）。掲載先は末尾の回の年（`NeurIPS 2017`・`CHI '20`・`(2019)`）を除いてまとめる。マップのフィルタの状態は App が持ち、表示メニューと分析パネルで共有する
- 研究動向: 最大 5 つの RQL クエリについて、OpenAlex の `group_by=publication_year` で年ごとの件数を取る（クエリの OpenAlex 向けコンパイルを使い、取得後の絞り込みはできないので近似であることを警告で示す）。全論文の年ごとの件数も取り、割合（‰）で比べられる。SVG の折れ線（近似は点線、今年は途中までなので薄い点）、件数と割合の切替、CSV 出力。1 つのクエリが失敗しても他は出す。最初のクエリには、このマップで最後に実行したクエリ検索を入れておく

### 13.6 文献ノートの書き出し（D8）

- プロジェクトメニューの書き出しに「文献ノート (.md)」。論文ごとに見出し・書誌・引用キー・読書状況・評価・タグ・比較表の値・メモ・抄録を並べる
- 見出しや項目名は表示言語で書く（8.4 の「書き出す文書は翻訳しない」の例外。ノートは利用者が読み続ける文書のため）
- Obsidian 用: 論文ごとに 1 ノート（`<プロジェクト名>/<引用キー>.md`、YAML front matter に title・authors・year・citekey・venue・doi・status・rating・tags）と一覧の `_index.md` を zip（無圧縮、`src/utils/zip.ts`）で渡す。マップ内の引用関係は `[[引用キー|Vaswani et al. (2017)]]` のリンクにする。Obsidian は 1 ファイルに 1 つの front matter しか読まないため、1 ファイルにはまとめない。ファイル名に使えない文字は `_` にする

### 13.7 コマンドパレット（E9）

- Ctrl+K（Mac は ⌘K）で開く。操作（パネルを開く・配置・書き出し・設定など）と、マップの論文（題名・著者・年）を一緒に絞り込む。↑↓ で選び Enter で実行、論文は選ぶとマップでその位置へ移動する
- 照合は語ごとの部分一致（大文字小文字・アクセント・全角半角を無視）。名前の先頭・語の先頭での一致を上位にし、操作 8 件・論文 8 件まで出す。操作は表示言語の名前ともう一方の言語の名前の両方で引ける（`src/store/palette.ts`）。論文は著者・タグでも引ける
- 操作: 各パネル（検索の各タブを含む）・論文を追加・自動整列・全体表示・向きの切替・元に戻す / やり直す・各形式の書き出し・新しいプロジェクト・ほかのプロジェクトを開く・設定・ショートカット一覧・表示言語の切替・強調表示の解除（強調中のみ）
- 入力欄にいても Ctrl+K で開く

### 13.8 マップの注釈（E10）

- ノード種別 `note`（`{ text, color }`）を足す。Toolbar の「付箋」かキャンバスのダブルクリック（ダブルクリックでのズームはやめる）で置き、その場で編集する（Markdown の一部を表示、Ctrl+Enter で確定、空のまま閉じると消える）。色は 5 色（選んだときに出る）
- 元に戻す: 置いただけの空の付箋は下書きとして履歴に入れない（`ADD_NOTE` と空の付箋の破棄 `DISCARD_NOTE` は記録せず、履歴の保存時に空の付箋を除く）。最初の文字の確定（`UPDATE_NOTE`）からが 1 手
- 論文・クラスタと手動エッジでつなげる。自動配置では動かさない（置いた位置のまま）。保存・JSON 書き出し・画像出力・元に戻すの対象。ライブラリ・統計・書き出しの対象外
