# 記事とサイト変更の公開手順

## 通常の公開

1. developを基点に作業ブランチを作成します。記事・画像・サイトの変更をコミットします。正式記事の公開状態は記事の `draft` で指定し、公開する記事だけを `draft: false` にします。
2. develop向けのPRを作成し、GitHub Actionsの `Checks` が成功してから取り込みます。この段階では本番公開しません。
3. 公開する内容を確認し、developの変更をmainへ反映するPRを作成します。PRの `Checks` 成功を確認してmainへマージします。mainへの反映は本番自動公開を起動します。
4. main更新で起動したCIの `Checks` と `Deploy production` を確認します。PR上のチェック成功だけを本番公開成功とは扱いません。
5. `Deploy production` の `Check latest main before publication` が `decision=publish reason=latest-main` であり、`Publish verified production artifact` が成功したことを確認します。
6. Cloudflare Pagesの `blog` で、productionデプロイの公開コミットがActionsのmainのコミットと一致することを確認します。公開URLの必要ページと画像を確認し、実行URL・デプロイID・コミットを記録します。

正式記事は0件でも公開できます。サンプルは検証用の入力であり、本番には含めません。検証用と本番用の生成条件は [Issue #66](../specs/issue-66-build-targets.md)、成果物検査は [Issue #67](../specs/issue-67-production-artifacts.md) を参照してください。

## CIの判定と待機

mainへのpushとChecks成功時だけ公開対象になります。develop・PR・手動起動ではチェックのみを行います。公開する成果物はChecks内で生成・検査し、公開ジョブでは再ビルドしません。

本番公開は `pages-blog-production` グループで同時1件です。実行中の公開は自動中止しません。待機中にさらに新しい公開ジョブが到着すると、GitHub標準の待機枠では古い待機ジョブが置き換えられます。公開直前に最新mainを取得し、古いコミットはスキップします。スキップされた古い実行を公開し直す必要はありません。現在のmainに対応する実行を確認してください。

mainの取得に失敗した場合も公開しません。判定ログの `target`、`latest-main`、`decision`、`reason` を確認します。理由の一覧と実装は [Issue #69](../specs/issue-69-deployment-order.md) を参照してください。

## 再実行と成果物の照合

再実行する場合は、Checksを含む全ジョブを再実行します。成果物には実行の試行番号も記録しているため、公開ジョブだけの再実行では元の成果物との照合が失敗する場合があります。任意の古いコミットを即時公開する操作は用意していません。

Actionsの成果物名は `production-<commit>-<run_id>-<run_attempt>` です。`manifest.json` と `dist/` を含みます。保存期間は7日であり、期限後は全ジョブの再実行で新しい成果物を作成してください。失敗時のPlaywright記録も7日保持します。

成果物を取得した後の本番ファイル照合には、次のコマンドを使います。

```powershell
node scripts/verify-live-publication.mjs <展開した成果物> <公開プロジェクト情報.json> <Actions実行情報.json> <照合結果.json>
```

公開プロジェクト情報にはCloudflareから取得した現在のcanonical productionデプロイの公開コミット・production状態・デプロイID・URLを、Actions実行情報にはmainへのpushの実行情報とproduction artifactのID・digestを渡します。トークンやアカウントの秘密値を含めません。コマンドは、まず成果物を再照合し、productionの基底URLで全ファイルの内容・サイズ・SHA-256を比較します。通常ページ・RSS・サイトマップ・共通画像のHTTP応答と、サンプル記事URLの404も確認します。

デプロイ固有URLも照合します。ただしCloudflare Accessの認証URLへHTTP 302で転送される場合は、固有URLの内容を未照合として記録し、公開URLの全ファイル照合を続行します。認証画面をサイトの成果物とは扱いません。照合のためにアクセス保護を解除する必要はありません。公開URLのファイル不一致は、固有URLが保護されている場合もエラーになります。

## 公開先と切り分け

Pagesプロジェクトは `blog`、本番ブランチは `main`、Pagesの基底URLは `https://blog-5w4.pages.dev/` です。Pages側の本番・プレビューのGit自動公開は停止し、GitHub Actionsから検査済み成果物を公開します。認証には登録済みの `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を使います。秘密値はチャット、ログ、検証記録へ貼り付けません。

`Checks` が失敗した場合は、その失敗を修正して再検証します。公開処理が失敗した場合は、Cloudflare側に既にデプロイが作成されている可能性もあるため、ActionsとCloudflareの公開コミット・状態を確認してから次の操作を決めます。

独自ドメイン・HTTPSの整備は #33、mainの保護と復旧手順は #34、画面全体と執筆・公開の総合手順は #35 の担当です。CI/CDの受け入れ検証結果は [Issue #70](../specs/issue-70-acceptance.md) に記録します。

## 取り消しPRによる本番復旧

1. GitHub Actionsの `CI` とCloudflare Pagesの `blog` を開き、現在の `main` のコミットと本番デプロイのコミットを確認します。不具合を起こしたPRと、影響を受けた公開ページを特定します。公開処理だけが失敗し、最新の `main` に修正が不要と判断できる場合は、そのコミットの全ジョブを再実行します。
2. 不具合を起こした変更を取り消すPRを、最新の `main` に対して作成します。原因のPRが `main` 宛てなら、GitHubのマージ済みPRで **Revert** を選び、取り消しPRの宛先が `main` であることを確認します。原因が `develop` からまとめて公開した変更の一部なら、最新の `main` から作業ブランチを作り、該当コミットまたは差分だけを取り消して `main` 宛てのPRを作成します。
3. PRの差分を確認します。競合があれば、後続の正常な変更を残して解消します。取り消し後も `.github/workflows/ci.yml` と、チェック・本番公開に必要なスクリプトや依存関係がそろっていることを確認します。初回公開の [PR #77](https://github.com/devegoma/blog/pull/77) にはCIと公開処理の追加も含まれています。このようなPRでは、不具合を起こした差分に絞って取り消すか、必要な箇所を修正するPRを作成します。
4. PRを最新の `main` に追従させ、GitHub Actionsの `Checks` と、ほかに必須チェックがあればそのすべての成功を確認して `main` にマージします。PRでは `Deploy production` がスキップされます。
5. マージ後の `main` のコミットで起動した `CI` を開き、`Checks` の成功と、`Deploy production` の `decision=publish reason=latest-main` および `Publish verified production artifact` の成功を確認します。公開がスキップされた場合は、現在の `main` に対応する実行を確認します。公開処理が失敗した場合は、Cloudflare Pagesの状態を確かめてから、必要に応じて対象コミットの全ジョブを再実行します。
6. Cloudflare Pagesで本番デプロイのコミットが復旧用の `main` コミットと一致することを確認します。公開URLで、影響を受けたページや画像を開いて復旧を確認します。Actionsの実行URL、本番デプロイID、公開コミット、確認したURLを記録します。
7. `develop` に不具合の原因となった変更が残っていれば、取り消しまたは修正を `develop` にも反映し、次の公開で再発しないようにします。
