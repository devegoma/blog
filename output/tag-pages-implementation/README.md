# タグ一覧・タグ別記事一覧の実装

2026-10-31。ユーザーの依頼により、Issue #10・#11専用スレッドのPC・モバイルデザインをサイトに反映した。

- #10 元デザイン：[PCライト](references/tag-list-pc-light.png)・[PCダーク](references/tag-list-pc-dark.png)・[モバイルライト](references/tag-list-mobile-light.png)・[モバイルダーク](references/tag-list-mobile-dark.png)
- #11 元デザイン：[PCライト](references/tag-articles-pc-light.png)・[PCダーク](references/tag-articles-pc-dark.png)・[モバイルライト](references/tag-articles-mobile-light.png)・[モバイルダーク](references/tag-articles-mobile-dark.png)

元デザイン画像は参照用として保存した。見出しの左揃え、PCタグ欄240pxの統一、モバイル3件・PC10件の折りたたみは、その後のユーザー指示を優先する。

## 実装画像

| 画面           | PCライト                          | PCダーク                         | モバイルライト                  | モバイルダーク                 |
| -------------- | --------------------------------- | -------------------------------- | ------------------------------- | ------------------------------ |
| タグ一覧       | [1440px](1440-light-tags.png)     | [1440px](1440-dark-tags.png)     | [390px](390-light-tags.png)     | [390px](390-dark-tags.png)     |
| タグ別記事一覧 | [1440px](1440-light-selected.png) | [1440px](1440-dark-selected.png) | [390px](390-light-selected.png) | [390px](390-dark-selected.png) |

320・1280pxの画像も同じフォルダに保存。全16画面で横はみ出しがないことを確認し、主要画面を目視した。画像は見本用の架空件数ではなく、既存の公開サンプル記事に基づく。

## 反映内容

共通の `TagPage.astro` でタグ選択前・選択後を表示する。PCのタグ欄は選択前後とも240pxで統一し、右に案内または記事を表示する。1199px以下は縦並び。ヘッダー、配色保存・OS追従、フォントは既存実装を使用する。

`ArticleList.astro` をホーム・月別一覧・タグ別一覧で共用。タグ別一覧では記事末尾にタグを配置する。公開日降順・同日の固定名昇順は共通データ処理を使用し、タグ別一覧に並べ替えボタンは置かない。

タグ選択・変更・解除・詳細ページ・前後ページは通常のリンク。1ページ10件で、`/tags/typescript/`、`/tags/typescript/page/2/` の形式。10件以下はページ送りを省く。未定義・公開0件のタグや範囲外ページは生成しない。タグが一つもなければ案内とホームへのリンクを表示する。

タグ画面は開発時も下書きを除く。記事詳細の開発用下書きプレビューは維持する。表示名は既存の `src/data/tags.ts` で管理し、URLには固定名を使う。

追加調整：タグ選択時のページ見出しを左端に揃えた。タグ欄はモバイル3件・PC10件まで表示し、超過分をボタンで開閉する。選択タグが上限外なら自動展開。JavaScriptなしでは全件表示する。3・4・10・11件の境界とEnter／Space操作、フォーカス維持をChromium・Firefoxの3サイズ（追加調整後のタグ関連18件）で確認した。

## 検証

- `pnpm lint` 成功。
- `pnpm check` 成功（エラー・警告0。別スレッドの既存404デザイン検証スクリプトにhintが1件）。
- 変更ファイルのPrettier確認、`git diff --check` 成功。
- `pnpm test:unit` 2件成功。
- `pnpm test:publication` 成功。公開・下書き化・削除・未定義タグ・MDX公開境界を確認。
- `pnpm test:tags` 相当の `node scripts/check-tags.mjs` 成功。10件・11件、複数タグ、同日順、前後URL、範囲外ページと下書き除外を確認。一時記事は終了時に削除する。通常の `pnpm test` にも組み込んだ。
- `pnpm build` 成功。
- Chromiumの1280・1920・390pxで51件成功。
- Firefoxの同3サイズで51件成功。サンドボックス内では起動時アクセス拒否となるため、外側で実行。専用ポート4329で48件成功し、既存テスト内にポート4321の固定URLがある3件は通常ポートで再実行して成功した。アプリの失敗ではない。
- タグの選択・変更・解除、記事詳細、現在地、タップ領域、両配色、画像16:9、JavaScriptなしの移動をブラウザテストで確認。

画像を再生成する場合はビルド後に `node output/tag-pages-implementation/render.mjs` を実行する。Playwrightの保存先が異なる環境では `PLAYWRIGHT_BROWSERS_PATH` を指定する。スクリプトはポート4328で専用プレビューを起動し、終了時に停止する。
