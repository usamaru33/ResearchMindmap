# セキュリティ / Security

## 脆弱性の報告 / Reporting a vulnerability

脆弱性を見つけた場合は、**公開の Issue には書かず**、GitHub の「Security」タブ →「Report a vulnerability」（Private vulnerability reporting）から非公開で報告してください。再現手順と影響を書いていただけると助かります。

Please **do not open a public issue**. Report it privately via the repository's **Security → Report a vulnerability** (GitHub private vulnerability reporting), with steps to reproduce and the impact.

## 想定している使い方 / Security model

このアプリは、**自分のパソコンで自分だけが使う**ことを前提にしています。

This app is meant to run **on your own machine, for yourself**.

- **APIキーはサーバー側（`.env`）だけ**で扱い、ブラウザにも API の応答にも出しません。`.env` は `.gitignore` に入っています。絶対にコミットしないでください。
  API keys live only in the server's `.env` and are never sent to the browser or included in responses. Never commit `.env`.
- API サーバーは既定で **`127.0.0.1` だけ**で待ち受け、次のリクエストを拒否します。
  By default the API listens on **127.0.0.1 only** and rejects:
  - Host ヘッダーがこのマシン以外のもの（DNS リバインディング対策）/ Host headers other than this machine (DNS rebinding)
  - ほかのサイトのページからのもの（CSRF 対策）/ calls from other websites' pages (CSRF)
  - `application/json` 以外の本文 / bodies that are not `application/json`
- `HOST=0.0.0.0` などでネットワークに公開すると、**そのポートに届く人は誰でもあなたの API キーを使えます**。公開する場合は、認証つきのリバースプロキシの内側に置き、`ALLOWED_HOSTS` / `ALLOWED_ORIGINS` を設定してください。
  If you expose it (e.g. `HOST=0.0.0.0`), **anyone who can reach the port can spend your API keys**. Put it behind an authenticating reverse proxy and set `ALLOWED_HOSTS` / `ALLOWED_ORIGINS`.

## 外部に送られるデータ / What leaves your machine

- 検索クエリ・論文の識別子・題名は、論文データベース（OpenAlex・Semantic Scholar・Crossref・arXiv・PubMed・IEEE Xplore・DBLP）に送られます。
  Queries, paper identifiers and titles are sent to the scholarly databases.
- `ANTHROPIC_API_KEY` を設定して Claude を使う機能を使うと、選んだ論文の書誌・抄録・入力した説明文が Anthropic の API に送られます。
  With `ANTHROPIC_API_KEY` set, Claude features send the chosen papers' metadata, abstracts and your text to the Anthropic API.
- `CROSSREF_MAILTO` を設定すると、その連絡先が Crossref へのリクエストに付きます（Crossref の polite pool のため）。
  `CROSSREF_MAILTO`, if set, is sent to Crossref with each request.
- プロジェクト・メモ・タグなどは**ブラウザの localStorage だけ**に保存され、サーバーには保存されません。API の応答はサーバーの `.cache/` に一時保存されます（コミットされません）。
  Projects, notes and tags are stored **only in your browser's localStorage**. API responses are cached in the server's `.cache/` (not committed).

## 対応するバージョン / Supported versions

最新の `main` ブランチだけを修正の対象にしています。 / Only the latest `main` branch receives fixes.
