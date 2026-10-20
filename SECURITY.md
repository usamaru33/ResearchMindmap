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
- Docker（`compose.yaml`）では、コンテナの中では全インターフェースで待ち受けますが、公開するポートは `127.0.0.1:8787` だけです。root ではないユーザー・読み取り専用のファイルシステム・権限なし（`cap_drop: ALL`）で動かします。
  With Docker, the container listens on all its interfaces but publishes only `127.0.0.1:8787`, running as a non-root user with a read-only filesystem and no capabilities.
- **Windows アプリ（exe）** は `.env` の設定にかかわらず `127.0.0.1` だけで待ち受けます。起動ごとに乱数のトークンを作り、アプリが開いたブラウザのタブにだけ HttpOnly・SameSite=Strict の Cookie を渡します。この Cookie の無い API 呼び出し（同じパソコンのほかのプログラム・ほかのユーザー）は拒否されます。設定は `%APPDATA%\ResearchMindmap\.env`、キャッシュは `%LOCALAPPDATA%\ResearchMindmap\cache` です。
  The **Windows app** always listens on 127.0.0.1, whatever `.env` says. Each launch creates a random token, and only the browser tab the app opened gets the HttpOnly, SameSite=Strict session cookie; API calls without it (other programs or users on the machine) are refused.
- `HOST=0.0.0.0` などでネットワークに公開すると、**そのポートに届く人は誰でもあなたの API キーを使えます**。公開する場合は、認証つきのリバースプロキシの内側に置き、`ALLOWED_HOSTS` / `ALLOWED_ORIGINS` を設定してください。
  If you expose it (e.g. `HOST=0.0.0.0`), **anyone who can reach the port can spend your API keys**. Put it behind an authenticating reverse proxy and set `ALLOWED_HOSTS` / `ALLOWED_ORIGINS`.

## ダウンロードした exe の確かめ方 / Verifying a release

Releases の exe は、タグを push したときに GitHub Actions（`.github/workflows/release.yml`）がビルドしたものだけです。コード署名はしていないので、使う前に次で確かめてください。
Release executables are built only by GitHub Actions from a tag. They are not code-signed, so verify them before running:

```powershell
(Get-FileHash .\ResearchMindmap.exe -Algorithm SHA256).Hash          # SHA256SUMS.txt と同じ / matches SHA256SUMS.txt
gh attestation verify .\ResearchMindmap.exe --repo usamaru33/ResearchMindmap
```

`gh attestation verify` が成功すれば、このリポジトリのワークフローがビルドした、改ざんされていないファイルです。ほかの場所で配られている exe は使わないでください。
If it succeeds, the file was built by this repository's workflow and has not been altered. Do not use executables from anywhere else.

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
