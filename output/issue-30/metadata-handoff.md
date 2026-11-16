# Issue #30 T1 共有情報の引き継ぎ

状態: T1の実装と専用生成HTML検査を完了。T3はこのファイルと image-handoff.md を確認して結合検証を開始できる。T1ではこれ以降ビルドや一時記事変更を実行しない。

## 実装

- `src/layouts/HomeLayout.astro`: 全通常ページにOG/Xの共有情報を1組出力。記事は `article` と記事名、非記事は `website` と既存のサイト名付きタイトル。共有説明はページのdescription、OG URLはcanonicalと同じ本番URLでクエリを含まない。共通画像は `https://blog.devegoma.com/images/social-share.png`。Xは `summary_large_image`。
- `src/layouts/Layout.astro`: 記事を共有用のarticleとして渡し、説明には既存の `post.summary` を使用。記事概要の抽出処理は変更・複製していない。
- noindex時はOG/X情報を出力しない。既存の404・開発用下書きのnoindex、canonical非出力、本番の下書き除外を維持。
- `scripts/check-social-metadata.mjs`: 元の記事を変更しない隔離コピーをビルドし、JavaScript無効のChromiumで生成HTMLのheadを解析。実際のdev応答の下書き・クエリ付き通常URLも検査。
- `package.json`: `test:social-metadata` を追加し、`pnpm test` へ接続。画像ファイルやT2/T3の専用検査・計画書は変更していない。

既存のHTML titleはサイト名付きのまま。記事のOG/X titleだけは合意どおり記事名となる。非記事のページ別紹介文とタグ2ページ目の識別は、#29の既存値を再利用した。

## TDDの実行結果

1. 公開記事のOG情報: Redは `og:type` が空配列、期待は `article`。共有headと記事の値を接続した後、同じ検査がGreen。
2. 記事のXカード情報: Redは `twitter:card` が空配列、期待は `summary_large_image`。X情報を追加後、同じ検査がGreen。
3. 404への非出力: Redは共有タグ12個、期待は0個。既存のnoindexを条件に共有情報を抑制後、同じ検査がGreen。
4. 既存の共通実装で満たされる回帰検査を追加し、すべて成功: ホーム・プロフィール・タグ一覧・タグ別先頭/2ページ目・月別、記事の説明文優先・本文概要・抽出不可時のタイトル、HTML特殊文字、各ページのcanonical、明示/未指定下書きの開発head非出力と本番除外、クエリ付きURLからのクエリ除去。ここは新たなRedが発生したとは扱わない。

最初の実行ではブラウザの既定パス不一致で停止したため、仕様のRedには数えていない。以降は次のプロセス環境を使用し、ブラウザ設定やソースに端末パスを保存していない。

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\ihash\AppData\Local\ms-playwright'
pnpm test:social-metadata
```

## 実施チェック

- 専用生成HTML検査: 成功（最終版で通常ページ全種・ページ送り・概要・404・開発下書き・本番除外を確認）。
- `pnpm test:search-metadata`: 成功（既存のページタイトル・description・canonical・RSS発見情報・noindex契約）。
- `pnpm lint`: 成功。
- `pnpm check`: エラー0、警告0、ヒント1。ヒントは取り込み元の `unit-tests/search-artifacts.test.mjs:162` にある未使用のrequest引数。T1追加コードの指摘なし。
- 変更4ファイルへのPrettier check: 成功。
- `git diff --check`: 成功。
- `pnpm test:content`: 成功（記事データ・共通概要の接続を含む既存検査）。

全体の必須チェック、通常サイトと画像を結合したプレビューHTTP、本番HTTP、X実表示はT3へ引き継ぐ。

## 前提差分の安全な反映

開始時のHEADは `c9d3b97b640a297b86ace331c071071a4274ac85`。GitHubのdevelopは2コミット先の `8ce558ae7be861c70bc1626a95466217e12386be` で、#27概要・#28 RSS・#29検索向け情報が未反映だった。

変更前にこのスレッドへ差分反映と依存取得を連絡した。GitHubのcompare結果にある32ファイルを上記の固定SHAから取得し、全対象が手元HEADから未変更であること、および追加対象の既存ファイルがないことを確認して反映した。HEAD・ブランチ・インデックスは動かしていない。既存の `docs/work-plan.md` の変更とT2画像関連は保持。現状の大きな差分にはこの前提反映が含まれるため、#30固有差分と区別すること。

固定SHAから反映したファイル:

```text
README.md
docs/GLOSSARY.md
docs/open-items.md
docs/requirements.md
docs/specs/content-data.md
docs/specs/issue-19-implementation.md
docs/specs/issue-27-summary.md
docs/specs/issue-28-rss.md
docs/specs/issue-29-sitemap.md
package.json
pnpm-lock.yaml
scripts/check-content.mjs
scripts/check-rss.mjs
scripts/check-search-artifacts.mjs
scripts/check-search-metadata.mjs
scripts/check-sitemap.mjs
src/components/HomePage.astro
src/components/Profile.astro
src/components/TagPage.astro
src/data/posts.ts
src/layouts/HomeLayout.astro
src/layouts/Layout.astro
src/pages/404.astro
src/pages/about.astro
src/pages/robots.txt.ts
src/pages/rss.xml.ts
src/pages/sitemap.xml.ts
src/utils/post-summary.mjs
tests/home.spec.ts
tests/rss.spec.ts
unit-tests/post-summary.test.mjs
unit-tests/search-artifacts.test.mjs
```

依存の追加は取り込み元の既存 `@astrojs/rss@4.0.19`、`satteri@0.10.5`、`sax@1.6.1`。T1独自の新規依存はない。`pnpm install --frozen-lockfile` は初回にpnpmキャッシュの書き込み権限で失敗し、許可された通常環境で成功した。ロックファイルを再解決していない。

## 残課題と実行上の注意

- T2の画像そのものは変更していない。headからは合意済みの公開パスを参照する。画像の形式・寸法・見た目・ライセンスはT2記録を参照。
- 専用検査は `test-results/social-metadata-*` に隔離コピーを作る。`test-results` を初期化するPlaywright全体検査と同時実行しない。
- トップのページ送りは既存未実装の別課題。現存するタグ別ページ送りを検証し、新たなトップページ送りは追加していない。
- 120文字境界など概要抽出自体の網羅は #27の既存検査の責任。T1では公開HTMLへの接続を検証。
- 本番HTTPとXの実表示は未確認。ローカル検査をXの表示確認済みとは扱わない。
- デプロイ・公開投稿・push・PR作成・コミットは行っていない。
