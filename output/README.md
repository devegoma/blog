# デザイン作業の履歴

検討案、生成画像、プロンプト、確認用プレビューを保存する。各案の「final」はその検討時点の版を表し、現在の採用仕様は [画面デザイン](../docs/design/README.md) を参照する。記事ページの案はサイトへ未反映である。

| 保存先                                                                 | 内容                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| [design-exploration](./design-exploration/LOGO.md)                     | 初期の方向性、ロゴ、書体・配色の試作             |
| [home-refinement](./home-refinement/DESIGN.md)                         | ホームのPC・モバイル案と修正過程                 |
| [home-logo-refinement](./home-logo-refinement/prompts.md)              | ロゴの調整、HTMLプレビュー、確認画像             |
| [home-polish](./home-polish/DESIGN.md)                                 | ナビ、サイドバー、プロフィール、リンクの配置検討 |
| [article-design](./article-design/DESIGN.md)                           | 記事ページのPC・モバイル案、配色・余白の調整     |
| [zenn-header-trial](./zenn-header-trial/README.md)                     | 検索付きヘッダーのPC・モバイル、ライト・ダーク案 |
| [zenn-header-implementation](./zenn-header-implementation/checks.json) | 実装後の画面画像と寸法の確認結果                 |

旧ホームのモバイル案は [デザイン資料](../docs/design/README.md#旧ホーム画面のデザイン記録) にある。最初に生成した検索なしの画像は、ユーザーの指定によりリポジトリへ追加しない。調査用の一時ファイルとブラウザのコピーも追加しない。

ロゴ調整案の確認は、Playwrightのブラウザを導入後に `node output/home-logo-refinement/verify.cjs` で実行する。プレビューはGoogle Fontsを使用するため、書体の読み込みにはネットワーク接続が必要になる。
