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
- [x] G3: 正常なmain更新の本番自動公開と、全19ファイルの一致を確認しました。
- [x] 統合: 証拠のURL、ID、コミット、ハッシュ、確定した操作方法と隣接Issueの未完了範囲を記録しました。

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

## G3の公開準備と承認の境界

[公開準備PR #77](https://github.com/devegoma/blog/pull/77) を作成しました。取り込み先はmain、対象ブランチは `codex/issue-70-release`、対象headは `9cb268860a3fe9a3c3dc7cfc4e1dc97ec9dfdbac` です。mainは初期コミットのため、このPRにはdevelopで実装済みのサイト全体も含みます。

[PRの必須チェック](https://github.com/devegoma/blog/actions/runs/43795101668) は成功しました。Lint・整形・型チェック、単体90件、CI隔離検証23シナリオ、キュー4ケースと古い対象の再実行、本番成果物の独立13シナリオ、両用途のビルドと成果物検査が成功しています。画面テストは186件成功、既存条件による対象外12件です。PRの `Deploy production` は正しくskippedでした。このPR上の成功を本番公開成功とは扱いません。

[公開前の対応表](../verification/issue70-production/pre-release.json) を保存しました。利用者は対象headのmain反映とPages blogのproduction自動公開を明示承認しました。その後の通常マージは、GitHubの `protect-main` が更新を制限しているためHTTP 405で拒否されました。所有者の画面でも例外対象が空で、マージできない状態を確認しました。

利用者は `Restrict updates` だけを無効にし、ほかの保護設定を維持する変更も承認しました。利用者によるGitHubの本人確認後、保存済みのルールをAPIで取得しました。更新制限だけが外れ、PR必須・強制プッシュ禁止・作成制限・削除制限・チェック設定が維持されています。[保存後のルール](../verification/issue70-production/main-rules-after.json) を保存しました。必須チェックの名前一覧が空である点など、保護全体の整備は #34 に残します。

PR #77はmainへマージされ、公開対象コミットは `1cb6bad6a13792daf6521bd70ba16411448fa0af` です。[mainのCI実行](https://github.com/devegoma/blog/actions/runs/43808240866) のChecksとDeploy productionはいずれも成功しました。

本番照合コマンド `scripts/verify-live-publication.mjs` は、正常な対応、別コミット、不一致ファイル、PRの検査結果を公開成功に使わないこと、404文書、Cloudflare Accessで保護されたデプロイ固有URLを扱う全6件のテストが成功しています。保護されたURLでは認証への転送を記録し、公開URLで全ファイルの一致を必須にします。

## G3の実測結果

mainのChecksジョブ `133103836661` と公開ジョブ `133106464549` は成功しました。公開直前のログは `decision=publish reason=latest-main` で、対象と最新mainはともに `1cb6bad6a13792daf6521bd70ba16411448fa0af` です。Wranglerは検査済み19ファイルを再ビルドせずに公開しました。[実行情報](../verification/issue70-production/run.json)、[ジョブと各ステップ](../verification/issue70-production/jobs.json)、[対応表](../verification/issue70-production/receipts.json) を保存しました。

本番成果物IDは `14200255028`、ZIPのSHA-256は `bb4809bc461324544d878ca170d5a8d53d06956ca7a7d564934d0fd748c8b15f` です。ダウンロードしたZIPのハッシュがGitHubのdigestと一致し、展開後のコミット・run・試行番号・全ファイルも再照合しました。[manifestの写し](../verification/issue70-production/manifest.json) を保存しました。

CloudflareのproductionデプロイIDは `4c0fbda1-5488-44a9-a6fb-3254b860b234` です。Cloudflare APIで取得した [公開先情報](../verification/issue70-production/project.json) のブランチmain、コミット、production、successがActionsと一致しました。[公開URL](https://blog-5w4.pages.dev/) の全19ファイルでサイズとSHA-256が成果物と一致しました。[配信の照合結果](../verification/issue70-production/live.json) に、ファイルごとのハッシュと必要ページ・RSS・サイトマップ・画像のHTTP 200、サンプル記事2URLのHTTP 404を記録しました。正式記事は0件で、必要ページは成立しています。

デプロイ固有URLはCloudflare Accessの認証へHTTP 302で転送されます。最初の照合では転送先の認証画面を取得したため不一致となりました。確認コマンドを修正し、認証への転送を明記しました。固有URLのファイル内容は未照合です。アクセス保護を解除せず、公開URLの全ファイル一致とCloudflareのcanonical productionデプロイ情報で今回の本番反映を確認しました。

## 操作方法と残る担当範囲

通常公開、判定ログ、待機、全ジョブの再実行、成果物保持期間、公開後の照合方法を [公開手順](../operations/publish.md) にまとめました。#32の実装・隔離検証に加え、#31から引き継いだ登録済みSecretsでの接続、mainからのWrangler自動公開、実行・デプロイ・コミット・成果物・本番URLの対応を確認しました。CI/CDの受け入れ条件は完了です。

独自ドメイン・HTTPSは #33、main保護と復旧手順は #34、全画面と執筆・公開手順の総合確認は #35 の担当です。これらの問題を、本番の正常なPages公開の成否とは分けて記録します。

2026-11-16 12:07 JSTの読み取り確認では、`https://blog.devegoma.com/` はHTTPSでHTTP 200を返しました。[到達状況](../verification/issue70-production/domain-observation.json) を保存しました。これはmain反映承認前の既存公開状態の確認であり、今回のmainからの公開成功には数えません。
