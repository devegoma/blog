# 404画面の実装（Issue #13）

2026-11-01。存在しないページを日本語で案内し、ホームへ戻れる404画面を追加した。PC・モバイルの両配色に対応する。

## 画面

ヘッダーとフッターの間で案内パネルを上下左右中央に配置する。幅1200px以上では幅808pxのパネルに404番号と案内を左右に配置し、それ未満は縦に並べる。高さが足りない場合や長い案内文でもスクロールでき、内容を切り取らない。共通のロゴ、検索準備中UI、配色切り替え、書体、枠線を使う。404ではメインナビに選択中の項目を設けない。

| 幅     | ライト                          | ダーク                         |
| ------ | ------------------------------- | ------------------------------ |
| 1440px | [画像](chromium-1440-light.png) | [画像](chromium-1440-dark.png) |
| 1280px | [画像](chromium-1280-light.png) | [画像](chromium-1280-dark.png) |
| 390px  | [画像](chromium-390-light.png)  | [画像](chromium-390-dark.png)  |
| 320px  | [画像](chromium-320-light.png)  | [画像](chromium-320-dark.png)  |

Firefoxでも同じ8条件の画像を `firefox-幅-配色.png` として保存した。PCライト・モバイルダークを目視確認した。

## 実装

- `src/pages/404.astro`：静的成果物のルートへ `404.html` を生成する。
- `src/styles/not-found.css`：中央配置、PCとモバイルのレイアウト、フォーカスとタップ領域。
- `src/components/SiteHeader.astro`：`active="none"` を追加する。他画面の初期値を維持する。
- `tests/not-found.spec.ts`：HTTPステータス、画面の中央位置、横はみ出し、長い日本語、両配色、44px以上の操作領域、キーボードとJavaScriptなしでのホーム移動を確認する。

## 検証

専用作業フォルダを最新のdevelopから作成して検証した。Lint、型チェック（エラー・警告・ヒント0）、単体テスト2件、ビルド、記事の公開・下書きへの差し戻し・削除の検証、タグの10/11件境界とページ送りの検証が成功した。

ブラウザ全体はChromium/Firefoxの1280/1920/390pxで実行。専用ポート4376では130件成功、8件は重複する全幅検証のため意図的にスキップ。残る6件は既存の記事テストが4321番ポートを固定参照するため接続できず、本来の4321番でその6件のみ再実行し全件成功した。合計136件のテストが成功した。アプリや記事テストの変更は不要だった。

404専用は14件成功、4件は重複ループのためスキップ。各ブラウザで320/390/1280/1440px×両配色の中央位置を1px未満の誤差で確認した。未定義ページ、削除済み記事を想定したURL、非公開記事、未定義タグ、公開記事0件のタグは、元のURLのまま案内を表示しHTTP 404を返した。

## 再確認

通常は `pnpm build` 後に `pnpm exec playwright test tests/not-found.spec.ts --workers=2` で検証する。別サーバーとの競合を避けたい場合は `pnpm exec playwright test tests/not-found.spec.ts --config output/issue-13-implementation/playwright.config.mjs --workers=2` を使う。後者は404専用テスト等のbaseURLを利用するテスト向けであり、4321番を固定参照する既存の記事テストには通常設定を使う。

確認用画面は `pnpm preview` で起動したサイトの `/missing-page/` など、存在しないURLから開く。

## 公開先

[Astroのカスタム404](https://docs.astro.build/en/basics/astro-pages/)と[Cloudflare Pagesの404配信](https://developers.cloudflare.com/pages/configuration/serving-pages/)に沿って、ルートに `404.html` を生成する。ローカル静的プレビューでHTTP 404を確認した。Cloudflare Pages本番でのHTTPステータスや直接アクセスは未確認のため、公開接続時に同じURLで確認する。
