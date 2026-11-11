import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const origin = "https://blog.devegoma.com";
async function fixture() {
    await mkdir(join(root, "test-results"), { recursive: true });
    const input = await mkdtemp(join(root, "test-results/production-"));
    const dist = join(input, "dist");
    for (const directory of [
        "src/content/posts",
        "tests/fixtures/content/posts",
        "public",
        "dist",
    ])
        await mkdir(join(input, directory), { recursive: true });
    for (const path of ["", "about/", "tags/"]) {
        await put(
            dist,
            `${path}index.html`,
            `<html><head><title>記録</title><meta name="description" content="記録"><link rel="canonical" href="${origin}/${path}"></head><body><div id="article-list"></div></body></html>`,
        );
    }
    await put(
        dist,
        "404.html",
        '<html><head><meta name="robots" content="noindex"></head></html>',
    );
    await put(
        dist,
        "sitemap.xml",
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "about/", "tags/"].map((path) => `<url><loc>${origin}/${path}</loc></url>`).join("")}</urlset>`,
    );
    await put(
        dist,
        "robots.txt",
        `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
    );
    await put(
        dist,
        "rss.xml",
        `<rss version="2.0"><channel><title>記録</title><link>${origin}/</link><description>記録</description></channel></rss>`,
    );
    return { input, dist };
}
async function put(root, path, value) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, value);
}
function inspect({ dist, input }) {
    const result = spawnSync(
        process.execPath,
        [join(root, "scripts/check-production-artifacts.mjs"), dist, input],
        { encoding: "utf8", timeout: 45000 },
    );
    assert.ifError(result.error);
    return { code: result.status, log: result.stdout + result.stderr };
}

test("正式記事0件の本番成果物を変更せず検査できる", async () => {
    const result = inspect(await fixture());
    assert.equal(result.code, 0, result.log);
});

test("その他のテキスト成果物に混入した下書き記事URLを拒否する", async () => {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/private.mdx",
        "---\ntitle: 同じ題名\n---\n\n執筆途中の記録です。",
    );
    await put(item.dist, "data.json", '{"href":"/posts/private/"}');
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /data.json.*private/);
});

test("公開記事が本文と一覧とサイトマップから同時に欠落しても拒否する", async () => {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/published.mdx",
        '---\ntitle: 公開記事\ndate: "2026-09-01"\ndraft: false\n---\n\n公開する記録です。',
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /published/);
});

test("正式記事0件のRSSに追加された項目を拒否する", async () => {
    const item = await fixture();
    await put(
        item.dist,
        "rss.xml",
        `<rss><channel><item><link>${origin}/posts/unexpected/</link></item></channel></rss>`,
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /rss.xml/);
});

test("下書き本文の固有段落が既存テキストに混入したら拒否する", async () => {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/private.mdx",
        "---\ntitle: 記録\n---\n\nPRIVATE_ARTICLE_PARAGRAPH_ONLY_123456789。",
    );
    await put(
        item.dist,
        "index.json",
        '{"body":"PRIVATE_ARTICLE_PARAGRAPH_ONLY_123456789。"}',
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /index.json.*private/);
});

test("参照されていない記事専用画像の残存を拒否する", async () => {
    const item = await fixture();
    await put(
        item.dist,
        "_astro/private.hash.webp",
        Buffer.from("private-image"),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /private.hash.webp/);
});

test("下書き専用画像は公開ページに参照が追加されても拒否する", async () => {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/private/entry.mdx",
        "---\ntitle: 記録\n---\n\n![画像](./photo.png)",
    );
    await put(item.input, "src/content/posts/private/photo.png", "image");
    await put(item.dist, "_astro/photo.hash.webp", "image");
    await put(
        item.dist,
        "index.html",
        (await readFile(join(item.dist, "index.html"), "utf8")).replace(
            "</body>",
            '<img src="/_astro/photo.hash.webp" data-production-source="src/content/posts/private/photo.png"></body>',
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /private\/photo.png/);
});
