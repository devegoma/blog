import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, unlink, rmdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { chromium, firefox, expect } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const id = `draft-check-${process.pid}`;
const directory = join(root, "src/content/posts", id);
const fixtures = [
    ["minimal", ""],
    ["index", "draft: true\n"],
    [
        "future",
        'draft: true\ndate: "2099-09-01"\nupdated: "2000-01-01"\ntags: [draft-only]\n',
    ],
];
const listener = createServer();
await new Promise((done) => listener.listen(0, "127.0.0.1", done));
const port = listener.address().port;
await new Promise((done) => listener.close(done));
const base = `http://127.0.0.1:${port}`;
await mkdir(directory);
let server;
try {
    for (const [name, fields] of fixtures)
        await writeFile(
            join(directory, `${name}.mdx`),
            `---\ntitle: ${id}-${name}\n${fields}---\n\n## Preview heading\n\n${id} preview body\n`,
            { flag: "wx" },
        );
    server = spawn(
        process.execPath,
        [
            join(root, "node_modules/astro/bin/astro.mjs"),
            "dev",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
        ],
        { cwd: root, stdio: "ignore" },
    );
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline && !ready) {
        try {
            ready =
                (
                    await fetch(`${base}/posts/${id}/minimal/`, {
                        signal: AbortSignal.timeout(3000),
                    })
                ).status === 200;
        } catch {
            /* The server is still starting. */
        }
        if (!ready) await setTimeout(200);
    }
    assert(ready, "Draft development server did not become ready");
    for (const [name] of fixtures) {
        const response = await fetch(`${base}/posts/${id}/${name}/`);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert(html.includes(`${id} preview body`));
        assert(html.includes("開発プレビュー限定"));
        assert(!html.includes('aria-label="前後の記事"'));
        assert(!html.includes('href="/tags/draft-only/"'));
        if (name === "minimal") assert(!html.includes('datetime="'));
    }
    for (const path of ["/", "/tags/", "/posts/sample/"]) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200);
        assert(!(await response.text()).includes(id), path);
    }
    for (const path of ["/tags/draft-only/", "/archives/2099-09/"])
        assert.equal((await fetch(base + path)).status, 404, path);
    for (const engine of [chromium, firefox]) {
        const browser = await engine.launch();
        try {
            for (const width of [1440, 390, 320]) {
                for (const colorScheme of ["light", "dark"]) {
                    const context = await browser.newContext({
                        viewport: { width, height: 900 },
                        colorScheme,
                        javaScriptEnabled: false,
                    });
                    try {
                        const page = await context.newPage();
                        await page.goto(`${base}/posts/${id}/future/`);
                        await expect(
                            page.locator(".draft-notice"),
                        ).toBeVisible();
                        await expect(
                            page.locator(".article-meta"),
                        ).toContainText("公開日（設定値）");
                        assert(
                            await page.evaluate(
                                () =>
                                    document.documentElement.scrollWidth <=
                                    window.innerWidth,
                            ),
                        );
                        if (width < 1200) {
                            await page.locator(".mobile-toc summary").click();
                            await expect(
                                page.locator(".mobile-toc[open]"),
                            ).toBeVisible();
                        }
                        await page.locator(".article-end a").click();
                        await expect(page).toHaveURL(base + "/");
                    } finally {
                        await context.close();
                    }
                }
            }
        } finally {
            await browser.close();
        }
    }
    console.log(
        "Draft previews passed: nested paths, ordinary index, title-only and future dates, public-only lists, both browsers × 3 widths × 2 themes without JavaScript.",
    );
} finally {
    if (server && server.exitCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
    }
    for (const [name] of fixtures)
        await unlink(join(directory, `${name}.mdx`)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
        });
    await rmdir(directory);
}
