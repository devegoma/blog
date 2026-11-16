import assert from "node:assert/strict";
import test from "node:test";
import { z } from "astro/zod";
import { createPostSchema } from "../src/data/post-schema.mjs";

test("article images use paths beside the article rather than public URLs", () => {
    const schema = createPostSchema({});
    assert.equal(
        schema.parse({ title: "Draft", image: "./cover.png" }).image,
        "./cover.png",
    );
    assert.equal(schema.parse({ title: "Draft" }).image, undefined);
    for (const image of [
        "/images/cover.png",
        "https://example.com/cover.png",
        "cover.png",
        "../cover.png",
    ])
        assert.equal(
            schema.safeParse({ title: "Draft", image }).success,
            false,
        );
});

test("the content loader can resolve images while verification keeps legacy URLs", () => {
    const metadata = {
        src: "/_astro/cover.hash.png",
        width: 32,
        height: 18,
        format: "png",
    };
    const formal = createPostSchema(
        {},
        undefined,
        z
            .string()
            .startsWith("./")
            .transform(() => metadata),
    );
    assert.deepEqual(
        formal.parse({ title: "Draft", image: "./cover.png" }).image,
        metadata,
    );
    const verification = createPostSchema(
        {},
        undefined,
        z.string().startsWith("/images/"),
    );
    assert.equal(
        verification.parse({ title: "Sample", image: "/images/sample.png" })
            .image,
        "/images/sample.png",
    );
    assert.equal(
        formal.safeParse({ title: "Draft", image: "/images/sample.png" })
            .success,
        false,
    );
});
