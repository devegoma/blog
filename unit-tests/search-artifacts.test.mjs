import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const origin = "https://blog.devegoma.com";
const urls = [origin + "/", origin + "/about/", origin + "/tags/"];
const html = (url) =>
    `<html><head><title>記録</title><meta name="description" content="学びの記録。">${url ? `<link rel="canonical" href="${url}">` : '<meta name="robots" content="noindex">'}<link rel="alternate" type="application/rss+xml" href="${origin}/rss.xml"></head><body>本文</body></html>`;
const xml = (values) =>
    `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${values.map((url) => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;

async function fixture() {
    await mkdir(join(root, "test-results"), { recursive: true });
    const directory = await mkdtemp(join(root, "test-results/artifacts-"));
    for (const [file, content] of [
        ["index.html", html(urls[0])],
        ["about/index.html", html(urls[1])],
        ["tags/index.html", html(urls[2])],
        ["404.html", html()],
        ["sitemap.xml", xml(urls)],
        [
            "robots.txt",
            `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
        ],
    ]) {
        await mkdir(dirname(join(directory, file)), { recursive: true });
        await writeFile(join(directory, file), content);
    }
    return directory;
}

function inspect(directory) {
    const result = spawnSync(
        process.execPath,
        [join(root, "scripts/check-search-artifacts.mjs"), directory],
        { cwd: root, encoding: "utf8", timeout: 30000 },
    );
    assert.ifError(result.error);
    return { status: result.status, log: result.stdout + result.stderr };
}

test("公開HTML・サイトマップ・robots.txtの整合する成果物を検査できる", async () => {
    const result = inspect(await fixture());
    assert.equal(result.status, 0, result.log);
});

test("掲載URLと異なるcanonicalを検出する", async () => {
    const directory = await fixture();
    await writeFile(join(directory, "about/index.html"), html(urls[0]));
    const result = inspect(directory);
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, /canonical/);
});

test("公開HTMLのサイトマップへの掲載漏れを検出する", async () => {
    const directory = await fixture();
    await writeFile(join(directory, "sitemap.xml"), xml(urls.slice(0, 2)));
    const result = inspect(directory);
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, /URL set/);
});

test("サイトマップの不正な名前空間を検出する", async () => {
    const directory = await fixture();
    await writeFile(
        join(directory, "sitemap.xml"),
        xml(urls).replace(
            "http://www.sitemaps.org/schemas/sitemap/0.9",
            "https://invalid.example/schema",
        ),
    );
    const result = inspect(directory);
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, /namespace/);
});

test("不正XML・余分な要素・重複URL・余分な掲載を検出する", async () => {
    for (const invalid of [
        xml(urls).replaceAll("urlset", "sitemapindex"),
        xml(urls).replace("</urlset>", ""),
        xml(urls).replace("</url>", "<lastmod>2026-10-01</lastmod></url>"),
        xml([...urls, urls[0]]),
        xml([...urls, origin + "/404/"]),
        xml(urls).replace(origin, "http://localhost:4321"),
    ]) {
        const directory = await fixture();
        await writeFile(join(directory, "sitemap.xml"), invalid);
        const result = inspect(directory);
        assert.notEqual(result.status, 0, result.log);
    }
});

test("公開ページのメタ情報欠落・重複と誤ったnoindexを検出する", async () => {
    for (const invalid of [
        html(urls[1]).replace("<title>記録</title>", ""),
        html(urls[1]).replace('content="学びの記録。"', 'content=""'),
        html(urls[1]).replace(
            "</head>",
            '<meta name="description" content="重複"></head>',
        ),
        html(urls[1]).replace(
            "</head>",
            '<meta name="robots" content="noindex"></head>',
        ),
        html(urls[1]).replace(
            "</head>",
            `<link rel="canonical" href="${urls[1]}"></head>`,
        ),
    ]) {
        const directory = await fixture();
        await writeFile(join(directory, "about/index.html"), invalid);
        const result = inspect(directory);
        assert.notEqual(result.status, 0, result.log);
    }
});

test("404のnoindex欠落とcanonical混入を検出する", async () => {
    for (const invalid of [
        html().replace('<meta name="robots" content="noindex">', ""),
        html().replace(
            "</head>",
            `<link rel="canonical" href="${origin}/404/"></head>`,
        ),
    ]) {
        const directory = await fixture();
        await writeFile(join(directory, "404.html"), invalid);
        const result = inspect(directory);
        assert.notEqual(result.status, 0, result.log);
        assert.match(result.log, /404/);
    }
});

test("robots.txtの誤ったサイトマップ案内をHTTP検査で検出する", async () => {
    const directory = await fixture();
    await writeFile(
        join(directory, "robots.txt"),
        "User-agent: *\nDisallow: /\nSitemap: http://localhost:4321/sitemap.xml\n",
    );
    const result = inspect(directory);
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, /robots/);
});

test("仮URLはHTMLとサイトマップが一致していても掲載対象にしない", async () => {
    const directory = await fixture();
    const preview = origin + "/preview/";
    await mkdir(join(directory, "preview"));
    await writeFile(join(directory, "preview/index.html"), html(preview));
    await writeFile(join(directory, "sitemap.xml"), xml([...urls, preview]));
    const result = inspect(directory);
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, /Unexpected public page/);
});

test("HTML内の外部画像を取得せずにメタ情報を検査する", async () => {
    let requests = 0;
    const server = createServer((request, response) => {
        requests++;
        response.end("image");
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    try {
        const directory = await fixture();
        await writeFile(
            join(directory, "index.html"),
            html(urls[0]).replace(
                "</body>",
                `<img src="http://127.0.0.1:${server.address().port}/external-image"></body>`,
            ),
        );
        const child = spawn(
            process.execPath,
            [join(root, "scripts/check-search-artifacts.mjs"), directory],
            {
                cwd: root,
                timeout: 30000,
            },
        );
        let log = "";
        child.stdout.on("data", (chunk) => {
            log += chunk;
        });
        child.stderr.on("data", (chunk) => {
            log += chunk;
        });
        const [code] = await once(child, "exit");
        assert.equal(code, 0, log);
        assert.equal(requests, 0, "External resource requests");
    } finally {
        await new Promise((done) => server.close(done));
    }
});
