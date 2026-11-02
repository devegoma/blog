import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";
import sax from "sax";

const directory = resolve(process.argv[2] ?? "dist");
const root = resolve(import.meta.dirname, "..");
const parser = sax.parser(true, { xmlns: true });
const urls = [];
const stack = [];
parser.onopentag = ({ local, uri }) => {
    assert.equal(
        uri,
        "http://www.sitemaps.org/schemas/sitemap/0.9",
        "Sitemap namespace",
    );
    assert.equal(
        local,
        ["urlset", "url", "loc"][stack.length],
        "Sitemap structure",
    );
    if (stack.length) stack.at(-1).children++;
    stack.push({ name: local, children: 0 });
    if (local === "loc") urls.push("");
};
parser.ontext = parser.oncdata = (text) => {
    if (stack.at(-1)?.name === "loc") urls[urls.length - 1] += text;
    else assert.equal(text.trim(), "", "Sitemap text outside loc");
};
parser.onclosetag = () => {
    const node = stack.pop();
    if (node.name === "url")
        assert.equal(node.children, 1, "Sitemap url requires one loc");
};
const xml = await readFile(join(directory, "sitemap.xml"), "utf8");
parser.write(xml).close();
assert.equal(stack.length, 0, "Unclosed sitemap element");

const expected = [];
for (const entry of await readdir(directory, {
    recursive: true,
    withFileTypes: true,
})) {
    if (!entry.isFile() || !entry.name.endsWith(".html")) continue;
    const path = relative(
        directory,
        join(entry.parentPath, entry.name),
    ).replaceAll("\\", "/");
    if (path === "404.html") continue;
    assert(path === "index.html" || path.endsWith("/index.html"), path);
    const pathname = `/${path.slice(0, -"index.html".length)}`;
    assert(
        ["/", "/about/", "/tags/"].includes(pathname) ||
            /^\/posts\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+$/.test(pathname) ||
            /^\/tags\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:page\/(?:[2-9]|[1-9]\d+)\/)?$/.test(
                pathname,
            ) ||
            /^\/archives\/\d{4}-(?:0[1-9]|1[0-2])\/$/.test(pathname),
        `Unexpected public page: ${pathname}`,
    );
    expected.push(new URL(pathname, "https://blog.devegoma.com").href);
}
assert.deepEqual([...urls].sort(), expected.sort(), "Sitemap URL set");

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route("**/*", (route) => route.abort());
    for (const value of urls) {
        const url = new URL(value);
        await page.setContent(
            await readFile(join(directory, url.pathname, "index.html"), "utf8"),
        );
        const title = page.locator("head title");
        assert.equal(await title.count(), 1, `title: ${value}`);
        assert((await title.textContent()).trim(), `title: ${value}`);
        const description = page.locator('head meta[name="description"]');
        assert.equal(await description.count(), 1, `description: ${value}`);
        assert(
            (await description.getAttribute("content"))?.trim(),
            `description: ${value}`,
        );
        const robots = await page
            .locator('head meta[name="robots"]')
            .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("content") ?? ""),
            );
        assert(
            robots.every((content) => !/\b(?:noindex|none)\b/i.test(content)),
            `noindex: ${value}`,
        );
        assert.deepEqual(
            await page
                .locator('head link[rel="canonical"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("href")),
                ),
            [value],
            `canonical: ${value}`,
        );
    }
    await page.setContent(await readFile(join(directory, "404.html"), "utf8"));
    assert.equal(
        await page.locator('head link[rel="canonical"]').count(),
        0,
        "404 canonical",
    );
    assert.deepEqual(
        await page
            .locator('head meta[name="robots"]')
            .evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("content")),
            ),
        ["noindex"],
        "404 noindex",
    );
} finally {
    await browser.close();
}

const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const base = `http://127.0.0.1:${port}`;
const server = spawn(
    process.execPath,
    [
        join(root, "node_modules/astro/bin/astro.mjs"),
        "preview",
        "--outDir",
        directory,
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--ignore-lock",
    ],
    { cwd: root },
);
let log = "";
server.stdout.on("data", (chunk) => {
    log += chunk;
});
server.stderr.on("data", (chunk) => {
    log += chunk;
});
try {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
        assert.equal(server.exitCode, null, log);
        try {
            ready = (await fetch(base, { signal: AbortSignal.timeout(3000) }))
                .ok;
        } catch {
            /* Wait until our own artifact server accepts connections. */
        }
        if (!ready) await setTimeout(100);
    }
    assert(ready, log);
    for (const value of urls) {
        const path = new URL(value).pathname;
        const response = await fetch(base + path, {
            redirect: "manual",
            signal: AbortSignal.timeout(3000),
        });
        assert.equal(response.status, 200, `HTTP: ${value}`);
        assert.match(response.headers.get("content-type") ?? "", /text\/html/);
        assert.equal(
            await response.text(),
            await readFile(join(directory, path, "index.html"), "utf8"),
            `HTTP artifact: ${value}`,
        );
    }
    const sitemap = await fetch(`${base}/sitemap.xml`);
    assert.equal(sitemap.status, 200, "HTTP sitemap");
    assert.match(
        sitemap.headers.get("content-type") ?? "",
        /(?:application|text)\/xml/,
    );
    assert.equal(await sitemap.text(), xml, "HTTP sitemap artifact");
    const robots = await fetch(`${base}/robots.txt`);
    assert.equal(robots.status, 200, "HTTP robots");
    assert.match(robots.headers.get("content-type") ?? "", /text\/plain/);
    assert.equal(
        await robots.text(),
        "User-agent: *\nAllow: /\nSitemap: https://blog.devegoma.com/sitemap.xml\n",
        "HTTP robots sitemap discovery",
    );
    const missing = await fetch(`${base}/__search_artifact_missing__/`);
    assert.equal(missing.status, 404, "HTTP missing page");
    assert.equal(
        await missing.text(),
        await readFile(join(directory, "404.html"), "utf8"),
        "HTTP 404 artifact",
    );
} finally {
    if (server.exitCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
    }
}
console.log(
    `Search artifact checks passed: ${urls.length} public URLs, HTML metadata, XML, robots.txt and local HTTP 200/404.`,
);
