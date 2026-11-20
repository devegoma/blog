# 記事の公開手順

## 執筆から公開まで

1. `develop` を基点に作業ブランチを作ります。[下書きの雛形](../templates/post-draft.mdx)を `src/content/posts/` にコピーし、タイトルと本文を書きます。例えば `src/content/posts/learning/entry.mdx` のURLは `/posts/learning/entry/` です。記事専用の画像は記事の近くに置き、`./` から始まる相対パスで参照します。
2. タグは `src/data/tags.ts` の固定名を記事の先頭にある `tags` に指定します。表示名を変える場合は定義の表示名だけを変更します。記事の参照とタグURLはそのまま使えます。タグを外す場合は記事の `tags` から固定名を除きます。 [READMEのタグ編集手順](../../README.md#タグを編集する)
3. `pnpm dev` を起動し、ローカルの `/posts/<記事パス>/` で下書きを確認します。下書きが表示されない場合は `.env` の `SHOW_DRAFTS` が未設定または `true` であることを確認し、変更した場合は開発サーバーを再起動します。公開後もURLを維持するため、ファイル名とフォルダはそのまま使います。
4. 公開するときは記事に `date: "YYYY-MM-DD"` と `draft: false` を設定します。`pnpm build` と `pnpm test:production-artifacts` を順に実行し、`pnpm preview` で記事と一覧を開きます。`develop` 向けのPRと `main` 向けの公開PRでそれぞれ `Checks` を確認します。`main` へのマージ後は、Actionsの公開ジョブと Cloudflare Pages の本番コミットを照合し、公開URLで記事・タグ・RSS・サイトマップを確認します。 [通常の公開手順](publish.md#通常の公開)

## 非公開にする

`draft: true` に変更し、同じ検証とPRの手順で公開サイトを更新します。公開完了後、元URLがHTTP 404を返し、記事がホーム・タグ・月別一覧・RSS・サイトマップから消えたことを確認します。公開後の不具合で変更を取り消す場合は、復旧手順に沿って `main` 向けの取り消しPRを作ります。 [取り消しPRによる復旧手順](publish.md#取り消しprによる本番復旧)
