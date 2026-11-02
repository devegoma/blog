import assert from "node:assert/strict";
import test from "node:test";
import { generateSummary } from "../src/utils/post-summary.mjs";

test("MDXの式やインポートを実行せず本文から除外する", () => {
    assert.equal(
        generateSummary({
            body: 'import value from "./does-not-exist.js";\n\n{(() => { throw new Error("実行しない"); })()}\n\n通常の文章。',
            title: "タイトル",
        }),
        "通常の文章。",
    );
});

test("本文未指定・空白・画像・インラインコードだけならタイトルを使う", () => {
    for (const body of [
        undefined,
        "  \n",
        "![説明](/image.png)",
        "`code`",
        "<aside>補足のみ</aside>",
    ]) {
        assert.equal(
            generateSummary({ body, title: "代用タイトル" }),
            "代用タイトル",
        );
    }
});

test("説明文と代用のタイトルは120文字を超えても切らない", () => {
    const longText = "説明".repeat(70);
    assert.equal(
        generateSummary({
            description: longText,
            body: "本文",
            title: "タイトル",
        }),
        longText,
    );
    assert.equal(generateSummary({ body: "", title: longText }), longText);
});

test("結合文字や複合絵文字を途中で分割しない", () => {
    assert.equal(
        generateSummary({
            body: "あ".repeat(118) + "か\u3099👨‍👩‍👧‍👦終",
            title: "タイトル",
        }),
        "あ".repeat(118) + "か\u3099👨‍👩‍👧‍👦",
    );
});

test("本文が119文字または120文字なら全文をそのまま返す", () => {
    for (const body of ["あ".repeat(119), "あ".repeat(120)]) {
        assert.equal(generateSummary({ body, title: "タイトル" }), body);
    }
});

test("概要は前後の空白を除いた説明文を本文より優先する", () => {
    assert.equal(
        generateSummary({
            description: "  執筆者の説明。\n",
            body: "本文。",
            title: "タイトル",
        }),
        "執筆者の説明。",
    );
});

test("説明文を省略すると日本語の本文段落を先頭から連結する", () => {
    assert.equal(
        generateSummary({
            body: "最初の段落。\n\n次の段落。",
            title: "タイトル",
        }),
        "最初の段落。 次の段落。",
    );
});

test("コードと表だけの記事はタイトルを概要にする", () => {
    assert.equal(
        generateSummary({
            body: "```js\nconsole.log('秘密');\n```\n\n| 見出し |\n| --- |\n| 表の内容 |",
            title: "コードと表の記録",
        }),
        "コードと表の記録",
    );
});

test("空文字や空白だけの説明文は本文から補う", () => {
    for (const description of ["", " \n\t　"]) {
        assert.equal(
            generateSummary({
                description,
                body: "本文から補う。",
                title: "タイトル",
            }),
            "本文から補う。",
        );
    }
});

test("リンクと強調は表示文字を残しインラインコードと画像は除外する", () => {
    assert.equal(
        generateSummary({
            body: "**重要**な[記事](https://example.com)と*学び*、`コード`と![画像の説明](/image.png)を記録。",
            title: "タイトル",
        }),
        "重要な記事と学び、とを記録。",
    );
});

test("本文の改行と連続空白を一つの空白へ整える", () => {
    assert.equal(
        generateSummary({
            body: "最初の文章。\n続きの  文章。\n\n　次の段落。",
            title: "タイトル",
        }),
        "最初の文章。 続きの 文章。 次の段落。",
    );
});

test("本文は120文字で切り省略記号を付けない", () => {
    assert.equal(
        generateSummary({ body: "あ".repeat(119) + "いう", title: "タイトル" }),
        "あ".repeat(119) + "い",
    );
});

test("参照形式のリンクと明示改行も表示文字として概要へ残す", () => {
    assert.equal(
        generateSummary({
            body: "[学び][note]を記録。  \n次の行。\n\n[note]: https://example.com",
            title: "タイトル",
        }),
        "学びを記録。 次の行。",
    );
});

test("見出し・リスト・引用・補足欄を飛ばして通常の段落を使う", () => {
    assert.equal(
        generateSummary({
            body: "# 見出し\n\n- 箇条書き\n\n> 引用\n\n<aside>\n\n補足の段落。\n\n</aside>\n\n採用する本文。\n\n```js\ncode()\n```\n\n| 表 |\n| --- |\n| 値 |\n\n続きの本文。",
            title: "タイトル",
        }),
        "採用する本文。 続きの本文。",
    );
});
