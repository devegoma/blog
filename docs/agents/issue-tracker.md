# Issue tracker: GitHub

Issueと仕様は https://github.com/devegoma/blog/issues で管理する。
操作には `gh` CLIを使う。

## 操作

- 作成: `gh issue create --repo devegoma/blog --title "..." --body-file <file>`
- 読取: `gh issue view <number> --repo devegoma/blog --comments`
- 一覧: `gh issue list --repo devegoma/blog --state open --json number,title,body,labels,comments`
- コメント: `gh issue comment <number> --repo devegoma/blog --body-file <file>`
- ラベル追加・削除: `gh issue edit <number> --repo devegoma/blog --add-label "..." --remove-label "..."`
- 完了: `gh issue close <number> --repo devegoma/blog --comment "..."`

複数行の本文はファイルに保存し、`--body-file` で渡す。
読取時は本文・コメント・ラベルを確認する。

## Pull requests as a triage surface

PRs as a request surface: no.

## スキルの指示との対応

「issue trackerへ公開」はGitHub Issueの作成を指す。
「関連ticketを取得」は対象Issueの本文・コメント・ラベルの取得を指す。
