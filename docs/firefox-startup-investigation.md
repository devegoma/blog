# Firefox 起動エラーの調査記録

## 結論

Codex 実行環境での AppData の転送により、Playwright が使用するパスと、Windows の Side-by-Side ローダーが依存 DLL を検索するパスが一致していなかった。

見かけのブラウザ保存先は次のパスだった。

```text
C:\Users\ihara\AppData\Local\ms-playwright
```

`GetFinalPathNameByHandleW` でファイルの実体を確認すると、次の保存先へ転送されていた。

```text
C:\Users\ihara\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ms-playwright
```

`firefox.exe` と `mozglue.dll` の両方でこの転送を確認した。一方、`sxstrace` では、Windows が見かけの保存先から `mozglue` を解決しようとして失敗していた。

## 確認した証拠

| 確認                                                       | 結果                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 見かけのパスで Firefox 単体を `-headless --version` で起動 | Windows エラー14001。Playwright の外でも再現                                    |
| `sxstrace`                                                 | `Cannot resolve reference mozglue`、`Activation Context generation failed`      |
| ファイルの版                                               | `firefox.exe`・`mozglue.dll` とも157.0                                          |
| 大文字・小文字の区別                                       | 保存先ディレクトリの区別は無効。`mozglue.dll` と `mozglue.DLL` の両方を参照可能 |
| 内容を変えずに作業フォルダへコピーした Firefox 一式        | 単体起動成功、`Mozilla Firefox 157.0`、終了コード0                              |
| コピーと元ファイルの SHA-256                               | `firefox.exe` と `mozglue.dll` はそれぞれ一致                                   |
| 実体パスを直接指定して単体起動                             | `Mozilla Firefox 157.0`、終了コード0                                            |
| 実体のブラウザ保存先を環境変数で指定して Playwright を実行 | Chromium／Firefox × 1280・1920・390px、全36件成功、37.5秒                       |

DLL 内のマニフェストIDも調べたが、変更前のコピーだけで正常起動したため、IDの変更は原因解消に必要な条件ではなかった。インストール済みファイルのマニフェスト、内容、アクセス権は変更していない。

## 確認に使った実行方法

既存の Node.js 24.22.1・pnpm 12.16.1 を使用し、今回のプロセスだけで次の環境変数を設定した。

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\ihara\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\ms-playwright'
pnpm exec playwright test --workers=2
```

このパスは今回の端末で確認した実体の保存先であり、他の端末へ固定値として展開しない。原因調査時点では、プロジェクトのソース、依存関係、Playwright 設定、ユーザー全体の環境変数は変更していない。

## 永続設定

この端末では、ユーザー環境変数 `PLAYWRIGHT_BROWSERS_PATH` に上記の実体パスを保存する。新しい端末やLinuxのCIではその環境の保存先を使用し、プロジェクト設定へこの端末のパスを固定しない。具体的な設定・読み込み・テスト手順は [READMEのテスト手順](../README.md) に記載する。

既存のターミナルとCodexは再起動して保存値を引き継ぐ。起動済みのPowerShellでは `[Environment]::GetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', 'User')` で保存値を読み込み、プロセスの同名環境変数へ設定する。ブラウザのインストールとテストで同じ値を使う。保存先を移動した場合やCodexを削除・再導入した場合は、保存先の存在を確認して設定を更新する。

ユーザーの依頼により、この端末のユーザー環境変数へ実体パスを保存した。`.NET` の読み戻しと `reg query HKCU\Environment /v PLAYWRIGHT_BROWSERS_PATH` の両方で保存値を確認した。続けて保存値をテストプロセスへ読み込み、Playwright全36件が成功した。

調査用スクリプト、Windows のトレース、ファイルパスの解決結果、比較用コピーは `tmp/firefox-diagnosis/` に分離してある。サイトの配信対象ではない。

## 参考資料

- [Microsoft：パッケージ化されたデスクトップアプリの AppData 操作](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes)
- [Microsoft：sxstrace](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sxstrace)
- [Playwright：ブラウザ保存先の指定](https://playwright.dev/docs/browsers#managing-browser-binaries)
