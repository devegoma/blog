# devegoma's blog

学習の記録を積み重ねる個人ブログ。現在はテーマ導入前の開発環境と動作確認用サンプルです。

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
通常は http://localhost:4321/ を開きます。トップから MDX サンプルへ移動できます。
Linux でブラウザを導入する場合は `pnpm exec playwright install --with-deps chromium firefox` を使います。

## コマンド

| コマンド            | 内容                                               |
| ------------------- | -------------------------------------------------- |
| `pnpm dev`          | 開発サーバー                                       |
| `pnpm lint`         | 推奨ルールで検査。警告も失敗扱い                   |
| `pnpm format`       | Prettier で整形                                    |
| `pnpm format:check` | 整形を検査                                         |
| `pnpm check`        | Astro / TypeScript の型チェック                    |
| `pnpm build`        | 静的ファイルを `dist/` に生成                      |
| `pnpm preview`      | ビルド済み成果物のプレビュー                       |
| `pnpm test`         | ビルド後、Chromium・Firefox × 3サイズの6構成で検証 |
| `pnpm test:ui`      | Playwright UI（先に `pnpm build` を実行）          |

`pnpm test:unit` で Node.js 標準テストランナーによる単体テストだけを実行できます。`pnpm test` は単体テストも先に実行します。

Playwright は 127.0.0.1:4321 で専用のプレビューを起動します。テスト時はこのポートを空けてください。
失敗時は `test-results/` にスクリーンショットと trace を保存します。
`pnpm exec playwright show-trace <trace.zipのパス>` で操作履歴を確認できます。
自動再試行は行いません。

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

テーマ選定、記事・タグ・下書き・RSS などのブログ機能、本番公開は未実装です。
サンプルを含む現在の `dist/` は動作確認用で、本番へのデプロイ処理は接続していません。
Cloudflare 接続時には、サンプルを含まない本番成果物の検証と同一成果物の公開、同時公開の制限、最新 main の確認を追加します。

詳細は [要件定義](docs/requirements.md) と [未確定・保留事項](docs/open-items.md) を参照してください。
