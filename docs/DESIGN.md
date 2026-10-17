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

### 4.3 マップ要素

| ノード種別 | 用途 |
|---|---|
| `paper` | 論文カード（既存） |
| `query` | 検索クエリ（マップの根。1 マップに 0〜1 個） |
| `cluster` | トピッククラスタ（OpenAlex の topic/subfield、または LLM 命名） |

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
| POST | `/api/resolve` | `{ inputs: string[] (≤100) }`（DOI / arXiv ID・URL / OpenAlex ID / PubMed ID / タイトル。行頭の `-` `1.` `[3]` は無視） | `{ items: [{ input, kind, ok, paper?, error? }] }`（DOI は OpenAlex → Crossref、arXiv は OpenAlex → arXiv API、タイトルは完全一致のうち被引用数最大） |
| POST | `/api/papers/expand` | `{ paper, kind: 'references' \| 'citations' \| 'related', limit? }` | `{ kind, papers, total, warnings }` |
| POST | `/api/llm/summarize` | `{ paper, lang }` | SSE |
| POST | `/api/llm/related-work` | `{ papers, topic, style, lang }` | SSE |
| POST | `/api/llm/gaps` | `{ papers }` | `{ gaps: [{title, evidence[], paperIds[]}] }` |

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
