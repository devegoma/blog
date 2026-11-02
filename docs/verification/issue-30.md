# Issue #30 共有情報・共通画像の結合検証

実施日: 2026-11-02（日本時間）。T3担当の記録。

## 範囲と前提

T1の [共有情報の引き渡し](../../output/issue-30/metadata-handoff.md) とT2の [画像の引き渡し](../../output/issue-30/image-handoff.md) が両方完了した後に実行した。T1/T2のソース・専用テスト・画像と、共有の計画書は変更していない。

手元HEADは `c9d3b97b640a297b86ace331c071071a4274ac85`。作業コピーにはT1が固定SHA `8ce558ae7be861c70bc1626a95466217e12386be` から反映した #27〜#29 の前提差分が含まれる。HEAD・ブランチ・インデックスを変更せず、既存の他タスクの変更を保持した。

## 追加した検証

`tests/social-share.spec.ts` は通常ビルドの全 `index.html` に対応するURLをプレビューHTTPで取得し、OG/Xの画像URLが本番想定の共通画像を参照していることを確認する。そのパスをローカルプレビューへ対応付け、リダイレクトなしの200、`image/png`、公開用PNGとのバイト一致を検証する。本番への画像リクエストは送らない。

現存する通常ページは10件（ホーム、プロフィール、タグ一覧、タグ別3件、月別1件、記事3件）。タグの2ページ目はT1の11記事を使う隔離検証が担う。404・開発下書きの非出力と本番下書き除外、共有タイトル・概要・正規URLの期待値は既存のT1専用検査を再実行し、重複実装しない。画像の形式・寸法・デコードはT2の既存テスト、見た目・素材利用条件はT2の引き渡し記録を参照する。

T3追加テストはT1/T2の成果がすでに揃った状態で初回から成功した。新たな製品コードのRed→Greenとしては数えない。最初の実行はAstroの既存プレビューロックで起動前に停止したため、仕様上のRedとしても数えない。

検出力の確認では、生成物 `dist/images/social-share.png` だけを一時的に破損させた。同じ結合テストがHTTP本文のバイト比較（50行目）で1件失敗した。`finally` で復元し、T2と同じSHA-256に戻ったことを確認してから最終検証を実行した。公開用の元画像は変更していない。これは検査の感度を確認する負の対照であり、製品実装のRed→Greenではない。最初の制限環境では終了処理が停止したため中断し、復元した。通常環境での再実行では失敗理由と終了を確認できた。

## 実行結果

| 確認                                                | 結果                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`                                         | 成功                                                                                                         |
| `pnpm format:check`                                 | 失敗。既存 `.yomiyasu` 配下の記録163ファイルが未整形。担当外のため変更しない                                 |
| `pnpm check`                                        | エラー0・警告0・ヒント1。取り込み元 `unit-tests/search-artifacts.test.mjs:162` の未使用request引数           |
| `pnpm test:unit`                                    | 34件成功                                                                                                     |
| `pnpm test:content`・`test:rss`・`test:publication` | 成功。入力・共通概要・RSS・公開状態変更・下書きの本番除外                                                    |
| `pnpm test:drafts`                                  | 通常環境で成功。制限環境ではFirefox起動で停止。再実行では両ブラウザ・3幅・両配色とJavaScriptなしの導線を確認 |
| `pnpm test:tags`・`test:sitemap`                    | 成功。タグとページ送り、正確な公開URL集合とHTML・HTTPを確認                                                  |
| `pnpm test:search-metadata`・`test:social-metadata` | 成功。通常ページ全種・ページ送り・概要・canonical・404・開発下書きの非出力と本番除外                         |
| `pnpm build`・`test:search-artifacts`               | 成功。公開URL10件と404を含む成果物とローカルHTTP                                                             |
| Playwright全体                                      | 最終実行は154件成功・既定条件による8件スキップ。失敗0件。Chromium / Firefox × 1280 / 1920 / 390px            |
| 追加した結合検証                                    | 6構成すべて成功。それぞれ通常ページ10件の共有画像参照と画像HTTPを確認                                        |
| 追加3ファイルの整形・コード検査                     | Prettier成功。追加テスト・専用設定のESLint成功。`git diff --check` 成功                                      |
| PNGのSHA-256                                        | `6EAC131E10E367306C0208BD1978A4BEF6A2E0391FF395EA565E2363F0E624B9`。T2引き渡し値と一致                       |

## 再実行

固定バージョンのNode.js / pnpmと導入済みのPlaywrightブラウザを使う。この端末ではプロセス環境の `PLAYWRIGHT_BROWSERS_PATH` を `C:\Users\ihash\AppData\Local\ms-playwright` に指定した。端末固有パスはソースに埋め込まない。

```powershell
pnpm lint
pnpm format:check
pnpm check
pnpm test
```

`pnpm test` は新しい結合テストも既存のPlaywright対象として実行する。一時記事の生成や隔離ビルドを含むため、同じ作業コピーで他のビルド・検証と並行実行しない。

今回は既存プレビューロックとの競合を避け、`pnpm test` 内の各検証コマンドを順番に実行し、最後のPlaywrightには [専用設定](../../output/issue-30/playwright-verification.config.ts) を使用した。通常設定の6構成とポート4321を継承し、`--ignore-lock` を指定する。ポートが使用中なら起動を失敗させ、既存のサーバーを停止・置換しない。

初回の全体実行はポート14330で148件成功・8件スキップ・6件失敗。失敗は既存の `tests/article.spec.ts:346` が4321番の絶対URLを直接使い、接続を拒否されたため。テストのソースは変更せず、専用設定を標準ポートへ合わせて全体を再実行した。

実行ログは `output/issue-30/required-checks.log`、`drafts-retry.log`、`remaining-checks.log`、`negative-control-retry.log`、`playwright-final.log` に分けて保存した。`pnpm test` と同じ検証コマンド群はすべて成功した。Lint・型チェック・ビルドも完了したが、全体の整形チェックは既存記録の問題で失敗しているため、必須チェック全体が成功したとは扱わない。

```powershell
pnpm exec playwright test --config output/issue-30/playwright-verification.config.ts --workers 2
```

## 本番HTTP・X実表示の未確認事項

本番ホーム `https://blog.devegoma.com/` と画像 `https://blog.devegoma.com/images/social-share.png` に、読み取り専用の `curl.exe -sS --max-time 15 -I` を実行した。制限環境・通常環境の両方で `curl: (6) Could not resolve host: blog.devegoma.com` となった。この環境から本番HTTPを確認できず、デプロイ状態を断定しない。

- 本番公開待ち: 本番ページと画像の200、MIME、画像実体、通常ページごとの共有情報と正規URLの確認が未完了。
- X確認待ち: 本番URLが取得可能になった後、ログイン済みのX投稿作成画面などで代表記事1件のURLを入力し、投稿せずカードを確認する。現行の非公開プレビューの利用可否も未確認。利用できなければ未完了を維持する。

ローカルHTML・HTTP検証をX実表示の確認済みとは扱わない。デプロイ、公開投稿、ログイン情報の変更、コミット、push、PR作成は実施していない。本番HTTPとX実表示が残るためIssue全体は未完了。
