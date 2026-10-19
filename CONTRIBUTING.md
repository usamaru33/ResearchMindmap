# コントリビューションの手引き / Contributing

Issue・Pull Request を歓迎します。 / Issues and pull requests are welcome.

## 準備 / Setup

```bash
# Node.js 22 以上（.nvmrc あり） / Node.js 22+ (see .nvmrc)
npm ci
cp .env.example .env     # APIキーは任意 / every key is optional
npm run dev              # http://localhost:5173
```

## 進め方 / Workflow

1. Issue で目的を共有するか、小さな修正ならそのまま Pull Request を作ってください。
   Open an issue first for anything larger than a small fix.
2. 1 つの Pull Request には 1 つの機能・修正だけを入れます。 / One feature or fix per pull request.
3. 次がすべて通ることを確認してください（CI でも実行されます）。 / These must pass (CI runs them too):

   ```bash
   npm run lint
   npm test
   npm run build
   ```

## 守ること / Rules

- **テストから外部 API を呼ばない**。`server/__tests__/fixtures/` に保存した応答を使います。
  **Tests must not call external APIs**; use saved responses in `server/__tests__/fixtures/`.
- **APIキー・`.env`・`.cache/`・個人情報をコミットしない**。fixture に実在の人のメールアドレスなどが含まれる場合は、ダミーに置き換えてください。
  **Never commit API keys, `.env`, `.cache/` or personal data.** Replace real e-mail addresses etc. in fixtures with dummies.
- Claude を使う機能には、APIキーがなくても動く代替処理を必ず用意します。
  Every Claude-powered feature needs a fallback that works without an API key.
- 画面の文言は直書きせず、`src/i18n/messages/` に日本語と英語の両方を追加し、`useT()`（React の外では `tr()`）で表示します。
  UI text goes into `src/i18n/messages/` in both Japanese and English, shown with `useT()` (`tr()` outside React).
- 純粋なロジック（パーサー、変換、reducer など）には Vitest のテストを付けます。
  Add Vitest tests for pure logic (parsers, converters, reducers…).
- コミットメッセージは Conventional Commits 形式（`feat:` `fix:` `docs:` `chore:` …）、英語で、本文に「なぜ」を書きます。
  Commit messages follow Conventional Commits, in English, explaining *why* in the body.

設計は [docs/DESIGN.md](docs/DESIGN.md)、データソースの追加方法は [.claude/skills/add-paper-source/SKILL.md](.claude/skills/add-paper-source/SKILL.md) を参照してください。

See [docs/DESIGN.md](docs/DESIGN.md) for the design and [.claude/skills/add-paper-source/SKILL.md](.claude/skills/add-paper-source/SKILL.md) for adding a data source.

## 脆弱性 / Security issues

公開の Issue ではなく、[SECURITY.md](SECURITY.md) の方法で報告してください。 / Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
