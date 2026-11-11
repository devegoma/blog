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

async function publishedFixture() {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/published.mdx",
        '---\ntitle: 公開記事\ndescription: 公開する概要です。\ndate: "2026-09-01"\ndraft: false\n---\n\n公開する記録です。',
    );
    const listing =
        '<div id="article-list"><article><div class="article-copy"><h2><a href="/posts/published/">公開記事</a></h2><p>公開する概要です。</p></div></article></div>';
    await put(
        item.dist,
        "index.html",
        (await readFile(join(item.dist, "index.html"), "utf8")).replace(
            '<div id="article-list"></div>',
            listing,
        ),
    );
    await put(
        item.dist,
        "archives/2026-09/index.html",
        `<html><head><title>月別</title><meta name="description" content="月別"><link rel="canonical" href="${origin}/archives/2026-09/"></head><body>${listing}</body></html>`,
    );
    await put(
        item.dist,
        "posts/published/index.html",
        `<html><head><title>公開記事 | devegoma's blog</title><meta name="description" content="公開する概要です。"><link rel="canonical" href="${origin}/posts/published/"></head><body><h1 id="article-title">公開記事</h1><div class="article-body"><p>公開する記録です。</p></div></body></html>`,
    );
    await put(
        item.dist,
        "sitemap.xml",
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["", "about/", "tags/", "posts/published/", "archives/2026-09/"].map((path) => `<url><loc>${origin}/${path}</loc></url>`).join("")}</urlset>`,
    );
    await put(
        item.dist,
        "rss.xml",
        `<rss version="2.0"><channel><title>記録</title><link>${origin}/</link><description>記録</description><item><title>公開記事</title><link>${origin}/posts/published/</link><guid isPermaLink="true">${origin}/posts/published/</guid><description>公開する概要です。</description><pubDate>Mon, 31 Aug 2026 15:00:00 GMT</pubDate></item></channel></rss>`,
    );
    return item;
}

test("公開記事本文の見出しが入力タイトルと異なれば拒否する", async () => {
    const item = await publishedFixture();
    assert.equal(inspect(item).code, 0);
    const file = "posts/published/index.html";
    await put(
        item.dist,
        file,
        (await readFile(join(item.dist, file), "utf8")).replace(
            '<h1 id="article-title">公開記事</h1>',
            '<h1 id="article-title">別の記事</h1>',
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /published.*h1/);
});

test("公開記事のhead titleが別記事になっていたら拒否する", async () => {
    const item = await publishedFixture();
    const file = "posts/published/index.html";
    await put(
        item.dist,
        file,
        (await readFile(join(item.dist, file), "utf8")).replace(
            "<title>公開記事 | devegoma's blog</title>",
            "<title>別の記事</title>",
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /published.*title/);
});

test("公開記事の説明文が入力の概要と異なれば拒否する", async () => {
    const item = await publishedFixture();
    const file = "posts/published/index.html";
    await put(
        item.dist,
        file,
        (await readFile(join(item.dist, file), "utf8")).replace(
            'content="公開する概要です。"',
            'content="別の記事の概要です。"',
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /published.*description/);
});

test("公開記事の本文だけが消えた成果物を拒否する", async () => {
    const item = await publishedFixture();
    const file = "posts/published/index.html";
    await put(
        item.dist,
        file,
        (await readFile(join(item.dist, file), "utf8")).replace(
            "<p>公開する記録です。</p>",
            "",
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /published.*body/);
});

test("HTMLの装飾と実体参照で表現された下書き固有段落を拒否する", async () => {
    const item = await fixture();
    await put(
        item.input,
        "src/content/posts/private.mdx",
        "---\ntitle: 記録\n---\n\nPRIVATE_ENTITY_MARKER_A & PRIVATE_ENTITY_MARKER_Bの非公開文章。",
    );
    await put(
        item.dist,
        "index.html",
        (await readFile(join(item.dist, "index.html"), "utf8")).replace(
            "</body>",
            "<p>PRIVATE_ENTITY_<strong>MARKER_A</strong> &amp; PRIVATE_ENTITY_MARKER_Bの非公開文章。</p></body>",
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /index.html.*private/);
});

test("JSONでUnicodeエスケープされた下書き固有段落を拒否する", async () => {
    const item = await fixture();
    const body = "PRIVATE_UNICODE_ARTICLE_PARAGRAPH_123456789";
    await put(
        item.input,
        "src/content/posts/private.mdx",
        `---\ntitle: 記録\n---\n\n${body}`,
    );
    await put(
        item.dist,
        "index.json",
        JSON.stringify({ body }).replace(
            /[A-Z_]/g,
            (letter) =>
                `\\u${letter.charCodeAt(0).toString(16).padStart(4, "0")}`,
        ),
    );
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /index.json.*private/);
});

test("正式記事0件でもRSS以外のXMLをRSSとして受け付けない", async () => {
    const item = await fixture();
    await put(item.dist, "rss.xml", "<arbitrary/>");
    const result = inspect(item);
    assert.notEqual(result.code, 0, result.log);
    assert.match(result.log, /rss.xml/);
});

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
