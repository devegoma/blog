# devegoma's blog

学習の記録を積み重ねる個人ブログ。確定デザインに基づくホーム・記事詳細とタグの導線を実装しています。正式記事と表示確認用サンプルの入力・成果物を分けています。本番公開前の状態です。

## セットアップ（Windows / PowerShell）

既存の NVM for Windows を使用します。`nvm use` は端末全体の Node.js の選択を変更します。

```powershell
nvm use 24.22.1
npm install -g pnpm@12.16.1
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium firefox
pnpm dev
```

Node.js は `v24.22.1`、pnpm は `12.16.1` が表示されることを確認してください。
通常は http://localhost:4321/ を開きます。`pnpm dev` は正式記事と下書きの執筆用です。サンプルは `pnpm dev:verification` で確認できます。記事詳細デザインの確認先は `/posts/automation/` です。
Linux でブラウザを導入する場合は `pnpm exec playwright install --with-deps chromium firefox` を使います。
Windows版Codexから実行する場合は、ブラウザ導入前に下記「Windows版Codexでのブラウザ保存先」を確認してください。

## コマンド

| コマンド                    | 内容                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                  | 正式記事と下書きの執筆用サーバー                                        |
| `pnpm dev:verification`     | サンプル確認用サーバー                                                  |
| `pnpm lint`                 | 推奨ルールで検査。警告も失敗扱い                                        |
| `pnpm format`               | Prettier で整形                                                         |
| `pnpm format:check`         | 整形を検査                                                              |
| `pnpm check`                | Astro / TypeScript の型チェック                                         |
| `pnpm build`                | 正式記事の公開対象だけを `dist/` に生成                                 |
| `pnpm preview`              | 本番用の `dist/` を確認                                                 |
| `pnpm build:verification`   | サンプルだけを `dist-verification/` に生成                              |
| `pnpm preview:verification` | 検証用の `dist-verification/` を確認                                    |
| `pnpm test`                 | 本番と検証の自動検査、Chromium・Firefox × 3サイズの画面テストを直列実行 |
| `pnpm test:ui`              | Playwright UI（先に `pnpm build:verification` を実行）                  |

### 本番用と検証用の分離

正式記事は `src/content/posts/`、サンプルは `tests/fixtures/content/posts/` に置きます。本番用は正式記事だけ、検証用はサンプルだけを読み込みます。現在の4記事はすべてサンプルで、正式記事は0件です。正式記事0件でもホーム・プロフィール・タグ一覧・RSS・サイトマップ・404を生成し、ホームには「公開記事はまだありません。」と表示します。

本番用の `dist/` には、下書き・サンプルの記事ページ、一覧掲載、RSS項目、サイトマップ項目、専用画像を含めません。検証用の `dist-verification/` は画面確認とサンプル依存テスト用です。本番用と検証用の生成は互いの出力先を上書きしません。

`pnpm test` は既存検査、本番への混入検査、両用途の生成・成果物検査、検証用成果物の画面テストを直列実行します。CIでも同じコマンドを使用します。入力を一時変更する公開状態・下書き・タグの検査と、保存先 `test-results/` を初期化する画面テストは、同じ作業コピーで他のビルド・テストと並行実行しないでください。通常開発とサンプル開発も同じ作業コピーでは同時起動せず、並行作業には別のworktreeを使ってください。データキャッシュは用途ごとに分けますが、Astroが生成する型情報とコンテンツ参照情報は `.astro/` を共有します。

仕様、worktreeごとのゴール、検証結果は [Issue #66の記録](docs/specs/issue-66-build-targets.md) を参照してください。

`pnpm test:unit` で Node.js 標準テストランナーによるテストを実行できます。成果物検査コマンドの正常・異常系も含むため、Chromiumを先にインストールしてください。`pnpm test` はこの検査も先に実行します。

ホームは公開記事を新しい順に10件ずつ表示します。ホームには並べ替えボタンや表示順ラベルを置かず、過去の記事はページ送りで閲覧します。2ページ目以降は `/page/2/` 形式のURLで閲覧できます。同日の記事は記事パスの昇順に固定し、画像未指定の記事では画像を省略します。`pnpm test:home` は隔離した記事で0・10・11・21件の表示、ページ境界、下書き除外、月別一覧の全件表示を確認し、PC・モバイルの両配色で前後のページへ移動します。`pnpm test`・CIにも含まれます。仕様と検証結果は [Issue #26 の記録](docs/specs/issue-26-home.md) を参照してください。一時出力は `test-results/` に保存するため、同フォルダを初期化するブラウザテストと並行実行しないでください。

`pnpm test:rss` は、隔離した記事を実際にビルドし、RSSの0件・20件・21件以上、概要・順序・日付・識別子、下書き・削除・差し戻し、XMLとHTTP応答・記事リンクを確認します。`pnpm test` にも含まれます。一時出力は `test-results/` に保存します。Playwrightが同じフォルダを初期化するため、ブラウザテストと並行して実行しないでください。

RSSの固定URLは `https://blog.devegoma.com/rss.xml` です。ローカルでは `/rss.xml` を開いて確認できます。ホーム・月別一覧・記事のプロフィールにあるRSSアイコンからアクセスでき、RSSリーダー用の自動検出情報も各ページに出力します。最新20件の公開記事について概要と記事リンクを掲載し、全文は配信しません。仕様と検証結果は [Issue #28 の記録](docs/specs/issue-28-rss.md) を参照してください。

サイトマップは `https://blog.devegoma.com/sitemap.xml` にビルド時に生成し、`/robots.txt` から案内します。トップとタグ別一覧の全ページ・プロフィール・タグ一覧・公開記事・月別アーカイブを掲載します。下書き・削除記事・公開記事のないタグや月・404は掲載しません。`pnpm test:sitemap` は隔離ビルドでXML・掲載URL集合・ページ送り・削除と下書きへの差し戻し・robots.txtに加え、全掲載ページのメタ情報とローカルHTTP応答を確認します。`pnpm test`とCIにも含まれます。[Issue #29 の仕様と検証記録](docs/specs/issue-29-sitemap.md) を参照してください。

公開ページにはページに応じた説明文と自身を指すcanonicalを出力します。404と開発用下書きプレビューはnoindexとし、canonicalを出しません。`pnpm test:search-metadata` は隔離ビルドのHTMLと実際の開発サーバーの応答を、JavaScript無効のChromiumで検査します。先に `pnpm exec playwright install chromium` を実行してください。一時出力は `test-results/` に保存するため、同フォルダを初期化するブラウザテストと並行実行しないでください。`pnpm test`とCIにも含まれます。

`pnpm build` 後の `pnpm test:search-artifacts` は、実際の `dist/` を検査します。HTML全件とサイトマップの集合、canonical・必須メタ情報・404、XMLの構造、robots.txt、同じ成果物を配信したローカルHTTP応答を確認します。別の出力先には `node scripts/check-search-artifacts.mjs <ディレクトリ>` を使用できます。本番ドメインへの通信は行いません。`pnpm test`は通常ビルドの直後にもこの検査を実行してから画面テストへ進みます。

`pnpm test:publication` は、一時記事を使って固定URL・公開データ検証・下書き除外・削除後の出力・開発プレビューを確認します。出力先は `test-results/` です。`pnpm test` では、この確認後に本番用と検証用の生成・検査を行い、検証用成果物で画面テストを実行します。同じ作業コピーで並行して実行しないでください。

## 記事を書く

最小構成の雛形は [公開記事](docs/templates/post-published.mdx) と [下書き](docs/templates/post-draft.mdx) にあります。雛形を `src/content/posts/` 内の希望するパスへコピーし、タイトルと本文を書き換えてください。公開記事の `date` は実際の公開日に変更します。

1. 追加: 下書きの雛形をコピーし、`pnpm dev` で本文を確認します。
2. 修正: 同じ記事ファイルのタイトル・本文・任意項目を編集します。更新日を記録する場合だけ `updated` を指定します。
3. 公開: `date: "YYYY-MM-DD"` と `draft: false` を指定し、`pnpm build` で検証します。`draft: true` に戻すか `draft` を削除すると下書きになります。
4. パス維持: 公開後はフォルダとファイル名を変えずに編集します。タイトル変更ではURLは変わりません。

`pnpm test:content` は、執筆中の記事を変更せず一時コピーで記事形式・既定値・URL・入力エラーを検証します。[Issue #19 の実装・受け渡し記録](docs/specs/issue-19-implementation.md) に、他機能から利用するデータをまとめています。

記事は `src/content/posts/` 内の任意の階層に `.mdx` で保存します。このディレクトリからの相対パスの拡張子を除き、`/posts/<記事パス>/` を生成します。例えば `automation.mdx` は `/posts/automation/`、`astro/routing.mdx` は `/posts/astro/routing/` になります。フォルダ名・ファイル名には小文字の半角英数字をハイフンでつないだ名前を使います。タイトルを変えてもURLは維持されますが、ファイル名の変更やフォルダ間の移動でURLが変わるため、公開後は記事のパスを変更しないでください。記事内の `slug` 指定は不要で、指定するとエラーになります。

通常のMarkdown構文もそのまま書けます。`.md` は記事として読み込みません。`index.mdx` は特別扱いせず、`astro/index.mdx` は `/posts/astro/index/` になります。同名のファイルもフォルダが異なれば別の記事です。コードのコピーや表の横スクロールに対応する記事形式をMDXに統一しています。本文は `##` から見出しを書き、ページのタイトルはメタ情報から表示します。

```yaml
---
title: 小さな自動化を試した記録
date: "2026-10-21"
updated: "2026-10-28"
tags: [typescript, astro]
description: 毎日の作業を少し楽にした記録。
minutes: 4
image: ./images/thumbnail.png
draft: false
---
```

公開には `title`・`date` と明示的な `draft: false` が必要です。公開状態の指定漏れは下書きです。公開日の未来日、公開日より前または日本時間の今日より後の更新日、未定義タグ、不正な記事パスはビルドエラーになります。記事ファイルの相対パスとURLを一対一で対応させ、URLの重複を防ぎます。

下書きは `.mdx` にタイトルだけで保存でき、`pnpm dev` で `/posts/<記事パス>/` を確認できます。下書きも同じ相対パスを使うため、仮URLは設けません。`pnpm build`・`pnpm preview` は本番向けの公開記事だけを表示します。公開済みの記事を下書きに戻すか削除して再ビルドすると、本文と一覧から除外され、元URLは404になります。

開発時の下書き表示は、ルートの `.env` で切り替えられます。初回は `Copy-Item .env.example .env` で作成し、次の値を設定してください。

```dotenv
SHOW_DRAFTS=true
```

`true` または未設定なら下書きの本文ページを表示し、`false` なら404にします。値は小文字の `true` / `false` を使い、変更後は `pnpm dev` を再起動してください。その他の値は非表示として扱います。ホーム・タグ・月別一覧は常に公開記事だけを表示します。本番ビルドは `SHOW_DRAFTS=true` でも下書きを除外します。記事ごとの公開状態は引き続き frontmatter の `draft` で指定し、`.env` はGit管理しません。

更新日・タグ・説明文・読了時間・画像は任意です。読了時間は省略時に文字数から概算します。記事一覧とページ説明には、説明文を優先する共通概要を使います。説明文が未指定・空白のみなら、本文の通常の段落から最大120文字を抽出し、抽出できなければタイトルを使います。末尾に `...` は付けません。説明文と代用のタイトルは120文字で切りません。RSS・SNS共有の実装でも同じ概要を利用します。抽出対象と利用方法は [Issue #27 の仕様](docs/specs/issue-27-summary.md) を参照してください。

`image` は一覧のサムネイル用です。正式記事の画像は記事の近くに置き、記事ファイルからの `./` 始まりの相対パスで指定します。例えば `src/content/posts/learning/entry.mdx` の `image: ./images/thumbnail.png` は `src/content/posts/learning/images/thumbnail.png` を参照します。本文画像は `![画像の説明](./images/photo.png)` のように書きます。HTMLの `<img src="./images/photo.png">` は記事のソース位置を参照しないため、この書き方で記事専用画像を指定しないでください。

記事専用画像を `public/` に置くと、下書きでもそのまま配信されます。`public/` はプロフィールなどの共通素材だけに使います。サンプル専用画像は `tests/fixtures/public/images/` で管理し、検証用だけで従来の `/images/sample-*.png` を使用します。

タグは `src/data/tags.ts` の固定名で参照します。同じ記事内で重複したタグは、最初の指定順を保って除去します。表示名を変更しても `/tags/<固定名>/` は維持します。公開記事で使われているタグだけが本番出力されます。本文の表とコードは、それぞれの枠内で横スクロールできます。コードにはコピーボタン、モバイル目次にはJavaScriptなしでも使える開閉を用意しています。

[記事詳細のデザインと実装記録](output/issue-9-article-implementation/README.md) に確認画像を掲載しています。

### タグを編集する

1. `src/data/tags.ts` の `definitions` に `["cpp", "日本語 C++"]` のような組を追加します。先頭が記事とURLで使う固定名、後ろが表示名です。固定名は `^[a-z0-9]+(?:-[a-z0-9]+)*$` に一致させ、重複させないでください。辞書への登録前に検査し、違反すると定義ファイルと固定名を示してビルドを失敗させます。
2. 記事の frontmatter で `tags: [cpp, astro]` のように固定名を指定して付け外しします。`tags: []` または項目の省略でタグなしにできます。同じ固定名の重複は最初の指定順を保って除去します。未定義の参照は下書きでもエラーです。
3. 表示名を変えるときは組の後ろだけを編集します。過去記事の参照はそのままで表示名が更新され、`/tags/cpp/` は維持されます。定義を削除するときは公開・下書き両方の記事から参照を外してください。
4. `pnpm check` と `pnpm build` で検査し、`pnpm preview` で記事とタグページを確認します。公開記事0件・下書きだけのタグは本番のタグ一覧やタグページへ出ません。

`pnpm test:tags` は一時的な定義・記事・検査用ページで、形式違反・定義重複・未定義参照によるビルド失敗、公開と下書きの既定値・重複除去、表示名の変更とURL維持、公開対象への接続、ページ送りを検証します。元ファイルは終了時に戻し、生成物は `test-results/` に保存します。検証中に同じ作業コピーのタグ定義や記事を編集したり、別のビルド・テストを並行実行したりしないでください。

### 補足欄の色

MDXの `aside` に `data-color` を付けると、赤・黄色・緑・青の4種類を使い分けられます。指定を省略すると青になります。背景・左の線・太字の色がライト／ダークに合わせて切り替わります。通常の本文は読みやすい文字色を維持します。

先頭の `strong` をタイトルとして、左にアイコンを自動表示します。赤は「×」、黄色は「！」、緑は「✓」、青は「〇」です。本文中の太字にはアイコンを付けません。

```mdx
<aside data-color="red" aria-label="警告">
    <strong>警告</strong>
    <p>削除する前にバックアップを確認してください。</p>
</aside>

<aside data-color="yellow" aria-label="注意">
    <strong>注意</strong>
    <p>作業前に設定を確認してください。</p>
</aside>

<aside data-color="green" aria-label="ヒント">
    <strong>ヒント</strong>
    <p>小さく試すところから始めましょう。</p>
</aside>

<aside data-color="blue" aria-label="補足">
    <strong>補足</strong>
    <p>関連する情報を記載します。</p>
</aside>
```

4種類の表示例は `pnpm dev:verification` または検証用プレビューの `/posts/sample/` で確認できます。色だけに頼らず、見出しにも「警告」「注意」などの用途を書いてください。

Playwright は 127.0.0.1:4321 で専用のプレビューを起動します。テスト時はこのポートを空けてください。
失敗時は `test-results/` にスクリーンショットと trace を保存します。
`pnpm exec playwright show-trace <trace.zipのパス>` で操作履歴を確認できます。
自動再試行は行いません。

### Windows版Codexでのブラウザ保存先

Codexからのファイル操作では、`AppData\Local\ms-playwright` が Codex専用の `LocalCache` 配下へ転送される場合があります。この環境では、Firefoxの起動時にWindowsが元のパスで `mozglue.dll` を探し、エラー14001となっていました。Playwrightでは `browserType.launch: spawn UNKNOWN` と表示されます。通常版Firefoxのインストール先や、Go版Playwrightのディレクトリへ変更しても、このプロジェクトのブラウザ指定とは一致しません。

今回確認した実体の保存先を、ユーザー環境変数 `PLAYWRIGHT_BROWSERS_PATH` に保存する方法は次のとおりです。他の端末では実体パスを確認してから設定してください。

```powershell
$browserCachePath = Join-Path $env:LOCALAPPDATA 'Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ms-playwright'
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', $browserCachePath, 'User')
```

設定後はターミナルとCodexを起動し直してください。すでに開いているPowerShellでは、次のコマンドで保存値を読み込んでからテストします。

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = [Environment]::GetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', 'User')
pnpm exec playwright install chromium firefox
pnpm test
```

インストールとテストで同じ保存先を使います。LinuxのCIや他の端末向けに、この端末固有のパスを `playwright.config.ts` へ固定しません。保存先を移動した場合やCodexを削除・再導入した場合は、設定先のブラウザが存在するか確認してください。

実体パスを指定した状態で、Chromium／Firefox × 1280・1920・390pxの全36テストが成功しています。調査の証拠と切り分けは [Firefox起動エラーの調査記録](docs/firefox-startup-investigation.md) を参照してください。

VS Code の推奨拡張と保存時整形設定は `.vscode/` にあります。
Node.js の型定義には実行環境と同じメジャーの `@types/node` を固定して使用します。

2026-10-28 に Windows / Node.js 24.22.1 / pnpm 12.16.1 で、固定インストール・Lint・整形チェック・型チェック・ビルド・6構成のブラウザテストが成功しました。
一時的な失敗テストでスクリーンショットと trace の保存も確認し、その一時テストは削除済みです。

## CI と依存関係の更新

main / develop への push と両ブランチ向け PR で、Lint・整形・型チェック・ビルド・ブラウザテストを実行します。
ジョブ上限は20分、失敗時のテスト記録は7日保持します。
Dependabot は develop 向けに毎週月曜09:00（日本時間）に更新を確認し、パッチ・マイナーはまとめ、メジャーは個別に PR を作成します。マージは手動です。

GitHub 上での CI 実行は push 後に確認が必要です。main のブランチ保護も未設定です。
CI が表示された後、リポジトリ側で main の直接 push を禁止し、PR と必須チェック `Checks` の成功を要求してください。レビュー承認は必須にしません。

## 今後の作業

ホームは PC・モバイル、ライト・ダーク切り替え、16:9サムネイル、共通背景と罫線の記事一覧に対応しています。初回は OS の配色設定に従い、手動選択を保存します。GitHub・X はユーザー提供のリンク先を設定済みで、RSSの購読導線も利用できます。共通デザインは [Issue #25の仕様](docs/specs/issue-25-common-design.md) に確定しました。検索UIは削除し、検索導入は必要性が明確になった段階で再検討する方針です。

2026-10-30 に Lint・整形・型チェック、単体テスト2件、Chromium／Firefox × 3サイズの計30ブラウザテストが成功しました。PC 1444px・モバイル390px／320pxの両配色も目視確認済みです。実装記録は [作業計画](docs/work-plan.md)、開発用素材とフォントの出典は [画像の出典](docs/design/images.md)・`public/fonts/README.md` を参照してください。

記事・タグ・下書き・RSS・サイトマップをローカルで検証できる状態です。現在の独自テーマのみを使用し、既存テーマの選定は行いません。本番公開は未実施です。
本番用の `dist/` と、サンプルを含む検証用の `dist-verification/` を分離しています。本番へのデプロイ処理は接続していません。
Cloudflare 接続時には、検証した同一の本番成果物の公開、同時公開の制限、最新 main の確認を追加します。

詳細は [要件定義](docs/requirements.md) と [未確定・保留事項](docs/open-items.md) を参照してください。
