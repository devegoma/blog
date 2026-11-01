# Issue #23 ローカル下書きプレビュー

#22 ブランチに依存する。既存の相対パスルーティングと下書き画面（PR #43・#46）を継承する。未確定の新規画面はなく、既存デザインを再生成しない。

- pnpm dev --host 127.0.0.1 で開く。notes/example.mdx は /posts/notes/example/、notes/index.mdx は /posts/notes/index/。タイトルのみ、draft: true、状態省略のいずれも本文を確認できる。
- 下書きには仮URLや共有用のプレビューを作らない。日付の前後関係は公開時に検証する。
- pnpm build と pnpm preview は公開記事だけを表示する。公開は明示的な draft: false と有効な公開日が必要。
- pnpm test:drafts は入れ子・index・タイトルのみ・未来日をHTTPで検証し、Chromium・Firefox × 1440/390/320px × 2配色で、JavaScriptなしの状態表示・目次・一覧への移動を検証する。pnpm test（CI）にも接続する。
- 既存の画面参照: [下書きデザイン](../../output/issue-15-preview/README.md)。

2026-11-01: pnpm test:drafts 成功。HTTP の3種の下書き、公開専用一覧と404、両ブラウザの12構成が成功。専用スクリプトのESLint・整形も成功。
