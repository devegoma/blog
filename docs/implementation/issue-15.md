# Issue #15 の sub-issue 実装

2026-11-01。最新の `origin/develop`（`7dd7f61`）を起点に、sub-issue ごとに Codex 管理 worktree を作成した。元の `D:/code/blog` にあった別作業の変更は保持した。

| Issue | ブランチ                            | worktree                                                           | 取り込み元 |
| ----- | ----------------------------------- | ------------------------------------------------------------------ | ---------- |
| #22   | `codex/issue-22-publication`        | `C:/Users/ihash/.codex/worktrees/issue-22-publication/blog`        | develop    |
| #23   | `codex/issue-23-draft-preview`      | `C:/Users/ihash/.codex/worktrees/issue-23-draft-preview/blog`      | #22        |
| #24   | `codex/issue-24-publication-checks` | `C:/Users/ihash/.codex/worktrees/issue-24-publication-checks/blog` | #23        |

変更をレビューするときは #22 → #23 → #24 の順に扱う。#24 の worktree が3件を含む統合状態。すべてローカルブランチとして保存し、push・PR作成・マージ・本番公開・Issue状態変更は行っていない。

- [#22 公開境界](./issue-22.md): 公開取得を開発・本番で既定化。記事詳細だけが開発時に下書きを取得し、本番では明示的に取得を指定しても除外する。
- [#23 下書きプレビュー](./issue-23.md): PR #43・#46 の既存ルーティングと画面を継承し、HTTPとブラウザの継続検証・手順を追加した。既存の採用デザインがあるため、新しい画面のデザイン生成は不要だった。
- [#24 成果物検証](./issue-24.md): 公開状態変更・削除後の全成果物の検査と本番HTTP 404を追加した。

`pnpm test` に公開判定・下書きプレビュー検証を接続済みで、既存CIの Checks ジョブから実行される。ローカルでは `PLAYWRIGHT_BROWSERS_PATH=C:/Users/ihash/AppData/Local/ms-playwright` を検証プロセスにだけ設定した。

RSS・サイトマップ本体は #17 配下で未実装のため、それらの実ルートとの最終結合確認は後続作業。XMLを含む漏出検査と共通取得の本番契約は今回用意した。親 #15 全体の完了・本番配信の確認とは区別する。

## 検証結果

- `pnpm lint`・`pnpm format:check`・`pnpm check`: 成功。型チェックのエラー・警告・ヒントは0件。
- `pnpm test:publication`: 成功。全ファイルの漏出検査、公開判定を明示的に上書きしようとした場合の本番除外、状態変更・削除後のHTTP 404。
- `pnpm test:drafts`: 成功。入れ子・index・最小項目・未来日、Chromium/Firefox × 3幅 × 2配色と別途JavaScriptなしの操作。
- `pnpm test:tags`・`pnpm test:unit`（9件）・`pnpm build`: 成功。
- `pnpm exec playwright test`: Chromium/Firefox × 3サイズで136件成功、既存の表示条件により8件スキップ、失敗0件。

個々の検査を実行し、長いビルド検査を含む `pnpm test` 全体の重複実行はしていない。GitHub側のCI実行はpush後に確認する。
