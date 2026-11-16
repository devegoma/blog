import assert from "node:assert/strict";
import test from "node:test";
import { formatPageTitle } from "../src/utils/page-title.mjs";

test("formats Japanese page titles with the blog name", () => {
    assert.equal(
        formatPageTitle("環境構築サンプル"),
        "環境構築サンプル | devegoma's blog",
    );
});

test("formats English page titles with the blog name", () => {
    assert.equal(formatPageTitle("About"), "About | devegoma's blog");
});
