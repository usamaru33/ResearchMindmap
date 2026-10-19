---
name: feature-workflow
description: The branch → implement → verify → commit → PR → merge procedure for every change in the ResearchMindmap repo. Use whenever starting, finishing, or shipping a roadmap item or any code/doc change here ("次の機能に進む", "PRを作って", "マージして", "ROADMAPの次", "implement F3"), even if the user only says "続けて". Encodes branch naming, commit message style, PR body template, merge strategy, and the ROADMAP/FEATURES status updates that must accompany each feature.
---

# 機能ごとの開発フロー（ResearchMindmap）

このリポジトリでは **1 機能 = 1 ブランチ = 1 PR** を守る。main へ直接コミットしない。
工程表は `docs/ROADMAP.md`、機能の状態は `docs/FEATURES.md`、設計は `docs/DESIGN.md` が正。

## 1. 着手

1. `git checkout main && git pull` で最新化
2. `docs/ROADMAP.md` で次の未着手項目（☐）を選び、その項目の「完了条件」を読む
3. ブランチを切る。名前は ROADMAP の「ブランチ」列そのまま
   - `feat/<短い名前>` 機能 / `fix/…` 不具合 / `chore/…` 基盤・設定 / `docs/…` 文書 / `test/…` テストのみ
4. 設計書と食い違う実装をする場合は、**先に** `docs/DESIGN.md` を直す（同じ PR に含めてよい）

## 2. 実装

- 既存コードの書き方に合わせる: 2 スペースインデント、シングルクォート、セミコロンあり、CSS Modules、コメントは英語で必要最小限
- 共有型は `shared/`、サーバーは `server/`、フロントは `src/`（DESIGN.md 3.3）
- 純粋ロジック（パーサー、正規化、reducer、書式変換）には必ず Vitest のテストを書く
- 外部 API を叩くテストは書かない。`server/__tests__/fixtures/` の保存済みレスポンスを使う
- コミットは意味のある単位に分ける（例: 「型とロジック」「UI」「テスト」）。1 PR に複数コミットでよい

## 3. 検証（すべて成功するまで PR を作らない）

```bash
npm run lint
npm test
npm run build
```

サーバーや検索に触れた変更なら、加えて `smoke-test` skill の手順を実行する。
UI を変えた場合は `npm run dev` で起動し、変更した操作を実際に試す（できない場合は PR 本文にそう書く）。

## 4. コミット

Conventional Commits 形式、英語、件名は 72 文字以内。本文に「なぜ」を書く。末尾に必ず:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

`.env`、`.cache/`、APIキーを含むファイルを絶対にコミットしない（`git status` で確認）。

## 5. PR

```bash
git push -u origin <branch>
gh pr create --base main --title "<type>: <日本語の要約>" --body-file <tmp>
```

本文テンプレート（`.github/pull_request_template.md` と同じ）:

```markdown
## 概要
<何を・なぜ>

## 変更内容
- …

## 関連
- ROADMAP: <項目ID> / FEATURES: <機能ID>

## 確認
- [x] npm run lint
- [x] npm test（<件数> tests）
- [x] npm run build
- [x] 動作確認: <何をどう確かめたか。未確認なら理由>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 6. マージ

1. 同じ PR の中で `docs/ROADMAP.md` の該当行を ☑ に、`docs/FEATURES.md` の該当機能の状態を ☑（一部なら ◐）にするコミットを入れる
2. `gh pr merge <番号> --merge --delete-branch --auto`（**merge commit** を使い、機能ごとのコミット履歴を残す）。main は保護されていて CI（`check`）が通るまでマージできないので、`--auto` で CI の成功後に自動でマージさせ、`gh pr checks <番号> --watch` で終わるまで待つ。CI が落ちたら直してから push し直す（main への直接 push・force push はできない）
3. `git checkout main && git pull`
4. ユーザーに 1〜2 行で「何をマージしたか・PR 番号」を報告して次の項目へ

## 失敗したとき

- lint / test / build が落ちたら直してから PR。テストを消したり skip したりして通さない
- 外部 API の障害でスモークテストができない場合は、PR 本文の「確認」にその事実とエラー内容を書く
- マージが衝突したら main を取り込んで解決し、再度検証してからマージ
