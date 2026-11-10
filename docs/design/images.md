# 共通画像と検証用画像

`sample-reading.png`、`sample-tools.png`、`sample-planning.png` は組み込み ImageGen で新規生成した表示確認用の画像です。`tests/fixtures/public/images/` で管理し、検証用だけで配信します。

正式記事の専用画像は記事の近くで管理します。`public/images/` は共通素材の配置先です。この場所のファイルは記事の公開状態にかかわらず本番成果物へコピーされます。

生成指示は「16:9の独立したブログ用サムネイル、夜の読書机／夜のノートパソコン／夕暮れの電車、青とアンバーの配色、文字・ロゴ・UIなし」。画面画像でUIを代用していない。

画面上のロゴは `docs/design/logo/` の単体素材を参考にDM Sansの太字と黄色いアポストロフィで再現し、画像内の余白やダーク背景に依存しないようにする。

プロフィールのアバターは、ユーザー提供の `profile.png` をホームなどの共通プロフィールと「このブログについて」で使用する。

2026-11-06にユーザーがChatGPTで生成した画像へ差し替えた。両プロフィールに「プロフィール画像はChatGPTで生成しました。」と表示する。

利用条件の参照先は [OpenAI利用規約](https://openai.com/policies/row-terms-of-use/) と [共有・公開ポリシー](https://openai.com/policies/sharing-publication-policy/)。OpenAIとの関係では、適用法の範囲内で生成物の権利は利用者に帰属する。第三者の権利を尊重し、AI生成であることを明示して使用する。
