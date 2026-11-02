import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/search-metadata-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
await mkdir(join(fixture, "src/content/posts"), { recursive: true });

function build() {
    const result = spawnSync(
        process.execPath,
        [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
        {
            cwd: fixture,
            encoding: "utf8",
            timeout: 60000,
            env: { ...process.env, SHOW_DRAFTS: "true" },
        },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
}
build();

// Read the real generated head with JavaScript disabled, as a crawler can.
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    async function assertMetadata(html, expected) {
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        assert.deepEqual(await page.locator("head title").allTextContents(), [
            expected.title,
        ]);
        assert.deepEqual(
            await page
                .locator('head meta[name="description"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("content")),
                ),
            [expected.description],
        );
        assert.deepEqual(
            await page
                .locator('head link[rel="canonical"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("href")),
                ),
            expected.canonical ? [expected.canonical] : [],
        );
        assert.deepEqual(
            await page
                .locator('head meta[name="robots"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("content")),
                ),
            expected.noindex ? ["noindex"] : [],
        );
        assert.deepEqual(
            await page
                .locator(
                    'head link[rel="alternate"][type="application/rss+xml"]',
                )
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("href")),
                ),
            ["https://blog.devegoma.com/rss.xml"],
        );
    }
    async function assertPage(path, expected) {
        await assertMetadata(
            await readFile(join(fixture, "dist", path), "utf8"),
            expected,
        );
    }
    await assertPage("index.html", {
        title: "記事 | devegoma's blog",
        description:
            "読んだ本、試した道具。日々の学びを記録する devegoma の個人ブログ。",
        canonical: "https://blog.devegoma.com/",
    });
    await assertPage("about/index.html", {
        title: "このブログについて | devegoma's blog",
        description:
            "devegomaのプロフィールと、このブログで記録している学びについて紹介します。",
        canonical: "https://blog.devegoma.com/about/",
    });
    await assertPage("tags/index.html", {
        title: "タグから探す | devegoma's blog",
        description:
            "タグを手がかりに、読んだ本や試した道具などの公開記事を探せます。",
        canonical: "https://blog.devegoma.com/tags/",
    });
    await mkdir(join(fixture, "src/content/posts/nested"));
    for (let index = 0; index < 11; index++) {
        const data = {
            title: index === 0 ? '学び & <道具> "記録"' : `記事${index}`,
            description: index === 0 ? "道具 & <比較>を試す。" : undefined,
            date: "2026-09-01",
            tags: ["typescript"],
            draft: false,
        };
        await writeFile(
            join(fixture, `src/content/posts/nested/entry-${index}.mdx`),
            `---\n${JSON.stringify(data)}\n---\n\n## 見出し\n\n本文からの概要。\n`,
        );
    }
    for (const draft of [true, undefined]) {
        await writeFile(
            join(fixture, `src/content/posts/draft-${String(draft)}.mdx`),
            `---\n${JSON.stringify({ title: `下書き${String(draft)}`, date: "2099-01-01", draft })}\n---\n\n下書き本文。\n`,
        );
    }
    build();
    for (const draft of ["true", "undefined"])
        await assert.rejects(
            readFile(join(fixture, `dist/posts/draft-${draft}/index.html`)),
            { code: "ENOENT" },
        );
    await assertPage("posts/nested/entry-0/index.html", {
        title: '学び & <道具> "記録" | devegoma\'s blog',
        description: "道具 & <比較>を試す。",
        canonical: "https://blog.devegoma.com/posts/nested/entry-0/",
    });
    await assertPage("posts/nested/entry-1/index.html", {
        title: "記事1 | devegoma's blog",
        description: "本文からの概要。",
        canonical: "https://blog.devegoma.com/posts/nested/entry-1/",
    });
    await assertPage("tags/typescript/index.html", {
        title: "TypeScriptの記事 | devegoma's blog",
        description: "「TypeScript」タグの公開記事一覧です。",
        canonical: "https://blog.devegoma.com/tags/typescript/",
    });
    await assertPage("tags/typescript/page/2/index.html", {
        title: "TypeScriptの記事 - 2ページ目 | devegoma's blog",
        description: "「TypeScript」タグの公開記事一覧です（2ページ目）。",
        canonical: "https://blog.devegoma.com/tags/typescript/page/2/",
    });
    await assertPage("archives/2026-09/index.html", {
        title: "2026年9月の記録 | devegoma's blog",
        description: "2026年9月に公開した記事の一覧です。",
        canonical: "https://blog.devegoma.com/archives/2026-09/",
    });
    await assertPage("404.html", {
        title: "ページが見つかりません | devegoma's blog",
        description:
            "お探しのページは存在しないか、移動または削除された可能性があります。",
        noindex: true,
    });
    const listener = createServer();
    await new Promise((done) => listener.listen(0, "127.0.0.1", done));
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(
        process.execPath,
        [
            join(root, "node_modules/astro/bin/astro.mjs"),
            "dev",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
        ],
        { cwd: fixture, env: { ...process.env, SHOW_DRAFTS: "true" } },
    );
    let log = "";
    server.stdout.on("data", (chunk) => {
        log += chunk;
    });
    server.stderr.on("data", (chunk) => {
        log += chunk;
    });
    try {
        const deadline = Date.now() + 30000;
        let ready = false;
        while (Date.now() < deadline && !ready) {
            assert.equal(server.exitCode, null, log);
            try {
                ready = (
                    await fetch(base, { signal: AbortSignal.timeout(3000) })
                ).ok;
            } catch {
                /* Wait until our own development server accepts connections. */
            }
            if (!ready) await setTimeout(200);
        }
        assert(ready, log);
        for (const draft of ["true", "undefined"]) {
            const response = await fetch(`${base}/posts/draft-${draft}/`);
            assert.equal(response.status, 200);
            await assertMetadata(await response.text(), {
                title: `下書き${draft} | devegoma's blog`,
                description: "下書き本文。",
                noindex: true,
            });
        }
        {
            const response = await fetch(
                `${base}/about/?utm_source=test#preview`,
            );
            assert.equal(response.status, 200);
            await assertMetadata(await response.text(), {
                title: "このブログについて | devegoma's blog",
                description:
                    "devegomaのプロフィールと、このブログで記録している学びについて紹介します。",
                canonical: "https://blog.devegoma.com/about/",
            });
        }
        for (const path of [
            "/does-not-exist/?utm_source=test",
            "/about?utm_source=test",
        ]) {
            const missing = await fetch(base + path);
            assert.equal(missing.status, 404);
        }
    } finally {
        if (server.exitCode === null) {
            const exited = once(server, "exit");
            server.kill();
            await exited;
        }
    }
} finally {
    await browser.close();
}
console.log(
    "Search metadata checks passed: public page titles/descriptions/canonicals, pagination, shared summaries, RSS discovery, 404 and draft noindex, development query URLs and production draft exclusion.",
);
