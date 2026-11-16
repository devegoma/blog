# Issue #70 Actionsと本番での受け入れ検証

## ゴールと基点

[Issue #70](https://github.com/devegoma/blog/issues/70) の完了条件は、実際のGitHub Actionsによる安全条件と正常な本番自動公開を確認し、コミット・成果物・Cloudflareデプロイ・本番反映を対応付けることです。基点は #69 を取り込んだdevelopの `532bcb1` です。計画日時は2026-11-16 11:35 JSTです。

| ゴール                            | worktree / ブランチ                                  | 完了条件                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 Actions上で隔離検証する        | `issue70-acceptance` / `codex/issue-70-acceptance`   | Cloudflare Secretsを参照しない検証用ワークフローで、実際の待機・同時実行制御、チェック失敗時のスキップ、待機中のmain更新、古い対象の再実行を確認します。実際の判定スクリプトと成果物照合を使用し、公開処理は記録用処理に置き換えます。 |
| G2 公開先と登録済み認証を確認する | `issue70-preflight` / `codex/issue-70-preflight`     | 登録済みSecretsを使う読み取り専用のActions検証で、Pages blog、本番ブランチmain、Pages側のGit自動公開停止と接続成功を確認します。秘密値は出力・保存しません。                                                                           |
| G3 正常な更新から実公開する       | `issue70-release` / `codex/issue-70-release`         | G1・G2成功後、正常なmain更新で必須チェックとproduction公開が成功します。Actions、コミット、成果物、Cloudflareデプロイ、本番ファイルを照合します。                                                                                      |
| 統合記録                          | `issue70-integration` / `codex/issue-70-integration` | 上記の証拠と操作方法をまとめ、#32の結論と #33・#34・#35 へ残る範囲を明記します。                                                                                                                                                       |

## チェックリスト

- [x] G1: 専用ブランチで実際のGitHub Actionsの待機と競合制御、古い対象・取得失敗・チェック失敗のスキップを確認し、証拠を保存しました。
- [x] G2: 登録済みSecretsでPages APIに接続し、公開先・本番ブランチ・Git自動公開停止を確認しました。秘密値は出力・保存していません。
- [ ] G3: 検査に成功した正常なmain更新の本番自動公開を確認し、成果物と公開ファイルを照合します。
- [ ] 統合: 成功・未完了を区別し、証拠のURL、ID、コミット、ハッシュ、確定した操作方法を記録します。

## 検証の境界

既存の作業コピーとworktreeは保持します。G1では本番と分離したconcurrencyグループとローカルGitリモートのmainを使い、実際のGitHubジョブ待機中に検証用mainを更新します。本番のmainへ意図的な不良成果物は入れません。チェック失敗を扱う検証用実行は意図した失敗を含み、その失敗が公開ジョブをスキップさせたことを別の監査ジョブで確認します。

本番デプロイは、必要な安全条件と公開先を確認した後にだけ行います。独自ドメイン・HTTPSは #33、ブランチ保護・復旧は #34、画面全体と執筆手順は #35 の担当です。正式記事の執筆は行いません。正式記事0件でも必要なページが成立すれば受け入れ可能です。

## G1の実測結果

[Actions受け入れ実行](https://github.com/devegoma/blog/actions/runs/43793878795) は成功しました。GitHub自身のconcurrencyで先行・後続のジョブを直列化しました。後続がqueuedであることをAPIで確認してから検証用Gitリモートのmainを更新し、その後に先行を終了させました。後続の公開開始は先行終了後であり、最新mainと一致する場合だけ記録用公開が1回呼ばれました。不一致・main取得失敗では0回です。古い対象を再検査するステップも公開されませんでした。

[チェック失敗の実行](https://github.com/devegoma/blog/actions/runs/43793878743) は、意図した終了コード17によって全体がfailureです。公開ジョブはskipped、監査ジョブはsuccessであり、受け入れ条件は成功しています。本番への公開もCloudflare Secretsの参照もありません。

生成された [検証結果](../verification/issue70-actions/acceptance.json)、[失敗時の監査結果](../verification/issue70-actions/failure-gate.json)、[実行・成果物の対応](../verification/issue70-actions/receipts.json) を保存しました。元のZIPのSHA-256がGitHubのartifact digestと一致することを確認しています。JSONは整形済みの写しです。

## G2の実測結果

[登録済み認証による事前確認](https://github.com/devegoma/blog/actions/runs/43793898523) は成功しました。Pagesプロジェクトは `blog`、本番ブランチは `main`、公開先の基底URLは `https://blog-5w4.pages.dev/` です。Git連携先は `devegoma/blog` で、本番・プレビューのGit自動公開はいずれも停止しています。

[プロジェクトの確認結果](../verification/issue70-preflight/issue70-project.json) と [取得元の対応](../verification/issue70-preflight/receipts.json) を保存しました。確認時点の既存productionデプロイはコミット `c5d2e87651fd6ef8fc7dcfbd76844893369b6260`、ブランチはdevelopでした。これは従来の公開状態であり、今回のmainからの自動公開成功とは扱いません。G3では新しいmainのコミットとの一致を必須にします。
