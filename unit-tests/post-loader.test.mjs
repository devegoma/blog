import assert from "node:assert/strict";
import test from "node:test";
import { postLoader } from "../src/config/post-loader.mjs";

function context(watcher) {
    const entries = [false, true].map((draft) => ({
        id: draft ? "draft" : "published",
        data: { title: "Article", draft, image: "./cover.png" },
        body: "Article body",
        filePath: "src/content/posts/article.mdx",
        digest: "cached-content",
        deferredRender: true,
        rendered: { html: "Article body" },
        assetImports: ["./cover.png"],
        imageImports: [["image"]],
    }));
    const writes = [];
    return {
        watcher,
        store: {
            values: () => entries,
            set: (entry) => writes.push(entry),
        },
        entries,
        writes,
    };
}

test("static builds retain validated draft data while removing render and image imports", async () => {
    const fixture = context();
    let loaded = false;
    const loader = postLoader({
        name: "glob-loader",
        async load(received) {
            assert.equal(received, fixture);
            loaded = true;
        },
    });
    await loader.load(fixture);
    assert(loaded);
    assert.deepEqual(fixture.writes, [
        {
            ...fixture.entries[1],
            deferredRender: false,
            assetImports: [],
            imageImports: [],
            rendered: undefined,
            digest: undefined,
        },
    ]);
    assert.equal(fixture.entries[0].deferredRender, true);
});

test("development retains draft render and image imports for previews", async () => {
    const fixture = context({});
    const loader = postLoader({ name: "glob-loader", async load() {} });
    await loader.load(fixture);
    assert.deepEqual(fixture.writes, []);
});
