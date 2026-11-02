import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/social-metadata-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
await mkdir(join(fixture, "src/content/posts/nested"), { recursive: true });
await writeFile(
    join(fixture, "src/content/posts/nested/example.mdx"),
    `---\n${JSON.stringify({ title: '本 & <道具> "記録"', description: "道具 & <比較>を試す。", date: "2026-09-01", tags: ["typescript"], draft: false })}\n---\n\n本文からの概要。\n`,
);
for (let index = 1; index <= 10; index++) {
    await writeFile(
        join(fixture, `src/content/posts/nested/entry-${index}.mdx`),
        `---\ntitle: 記録${index}\ndate: "2026-09-01"\ntags: [typescript]\ndraft: false\n---\n\n本文からの概要。\n`,
    );
}
await writeFile(
    join(fixture, "src/content/posts/nested/code-only.mdx"),
    '---\ntitle: コードだけの記録\ndate: "2026-08-01"\ndraft: false\n---\n\n```js\nconst example = 1;\n```\n',
);
for (const draft of [true, undefined]) {
    await writeFile(
        join(fixture, `src/content/posts/draft-${String(draft)}.mdx`),
        `---\n${JSON.stringify({ title: "下書きの記録", draft })}\n---\n\n下書き本文。\n`,
    );
}
const result = spawnSync(
    process.execPath,
    [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
    { cwd: fixture, encoding: "utf8", timeout: 60000 },
);
assert.ifError(result.error);
assert.equal(result.status, 0, result.stdout + result.stderr);

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    async function assertSocial(path, expected) {
        await page.setContent(
            await readFile(join(fixture, "dist", path), "utf8"),
        );
        for (const [property, value] of Object.entries(expected)) {
            assert.deepEqual(
                await page
                    .locator(
                        `head meta[property="${property}"], head meta[name="${property}"]`,
                    )
                    .evaluateAll((nodes) =>
                        nodes.map((node) => node.getAttribute("content")),
                    ),
                [value],
                `${path}: ${property}`,
            );
        }
    }
    await assertSocial("posts/nested/example/index.html", {
        "og:type": "article",
        "og:title": '本 & <道具> "記録"',
        "og:description": "道具 & <比較>を試す。",
        "og:url": "https://blog.devegoma.com/posts/nested/example/",
        "og:site_name": "devegoma's blog",
        "og:image": "https://blog.devegoma.com/images/social-share.png",
        "og:image:alt": "devegoma's blog",
        "twitter:card": "summary_large_image",
        "twitter:title": '本 & <道具> "記録"',
        "twitter:description": "道具 & <比較>を試す。",
        "twitter:image": "https://blog.devegoma.com/images/social-share.png",
        "twitter:image:alt": "devegoma's blog",
    });
    await assertSocial("posts/nested/entry-1/index.html", {
        "og:description": "本文からの概要。",
        "twitter:description": "本文からの概要。",
    });
    await assertSocial("posts/nested/code-only/index.html", {
        "og:description": "コードだけの記録",
        "twitter:description": "コードだけの記録",
    });
    for (const [path, title, description, url] of [
        [
            "index.html",
            "記事 | devegoma's blog",
            "読んだ本、試した道具。日々の学びを記録する devegoma の個人ブログ。",
            "https://blog.devegoma.com/",
        ],
        [
            "about/index.html",
            "このブログについて | devegoma's blog",
            "devegomaのプロフィールと、このブログで記録している学びについて紹介します。",
            "https://blog.devegoma.com/about/",
        ],
        [
            "tags/index.html",
            "タグから探す | devegoma's blog",
            "タグを手がかりに、読んだ本や試した道具などの公開記事を探せます。",
            "https://blog.devegoma.com/tags/",
        ],
        [
            "tags/typescript/index.html",
            "TypeScriptの記事 | devegoma's blog",
            "「TypeScript」タグの公開記事一覧です。",
            "https://blog.devegoma.com/tags/typescript/",
        ],
        [
            "tags/typescript/page/2/index.html",
            "TypeScriptの記事 - 2ページ目 | devegoma's blog",
            "「TypeScript」タグの公開記事一覧です（2ページ目）。",
            "https://blog.devegoma.com/tags/typescript/page/2/",
        ],
        [
            "archives/2026-09/index.html",
            "2026年9月の記録 | devegoma's blog",
            "2026年9月に公開した記事の一覧です。",
            "https://blog.devegoma.com/archives/2026-09/",
        ],
    ]) {
        await assertSocial(path, {
            "og:type": "website",
            "og:title": title,
            "og:description": description,
            "og:url": url,
            "og:image": "https://blog.devegoma.com/images/social-share.png",
            "twitter:card": "summary_large_image",
            "twitter:title": title,
            "twitter:description": description,
            "twitter:image":
                "https://blog.devegoma.com/images/social-share.png",
        });
        assert.deepEqual(
            await page
                .locator('head link[rel="canonical"]')
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("href")),
                ),
            [url],
            `${path}: canonical`,
        );
    }
    await page.setContent(
        await readFile(join(fixture, "dist/404.html"), "utf8"),
    );
    assert.equal(
        await page
            .locator('head meta[property^="og:"], head meta[name^="twitter:"]')
            .count(),
        0,
        "404 must not advertise a social card",
    );
    for (const draft of ["true", "undefined"])
        await assert.rejects(
            readFile(join(fixture, `dist/posts/draft-${draft}/index.html`)),
            { code: "ENOENT" },
        );

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
        {
            cwd: fixture,
            env: { ...process.env, SHOW_DRAFTS: "true" },
        },
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
                /* Server is starting. */
            }
            if (!ready) await setTimeout(200);
        }
        assert(ready, log);
        for (const draft of ["true", "undefined"]) {
            const response = await fetch(`${base}/posts/draft-${draft}/`);
            assert.equal(response.status, 200);
            await page.setContent(await response.text());
            assert.equal(
                await page
                    .locator(
                        'head meta[property^="og:"], head meta[name^="twitter:"]',
                    )
                    .count(),
                0,
                `draft-${draft}: no social card`,
            );
            assert.equal(
                await page.locator('head link[rel="canonical"]').count(),
                0,
            );
            assert.equal(
                await page
                    .locator('head meta[name="robots"]')
                    .getAttribute("content"),
                "noindex",
            );
        }
        const response = await fetch(`${base}/about/?utm_source=test`);
        assert.equal(response.status, 200);
        await page.setContent(await response.text());
        assert.equal(
            await page
                .locator('head meta[property="og:url"]')
                .getAttribute("content"),
            "https://blog.devegoma.com/about/",
        );
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
console.log("Social metadata checks passed.");
