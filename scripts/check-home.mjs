import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/home-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
await cp(join(root, "public"), join(fixture, "public"), { recursive: true });
const posts = join(fixture, "src/content/posts");
await mkdir(join(posts, "nested"), { recursive: true });
for (const draft of [true, undefined]) {
    await writeFile(
        join(posts, `draft-${String(draft)}.mdx`),
        `---\n${JSON.stringify({ title: "下書きの記録", date: "2099-01-01", draft })}\n---\n\n下書き本文。\n`,
    );
}
function build() {
    const result = spawnSync(
        process.execPath,
        [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
        { cwd: fixture, encoding: "utf8", timeout: 60000 },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
}
const html = (path = "") =>
    readFile(join(fixture, "dist", path, "index.html"), "utf8");

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    await page.route("**/*", (route) => route.abort());
    for (const count of [0, 10, 11, 21]) {
        for (let index = 1; index <= count; index++) {
            const id = String(index).padStart(2, "0");
            await writeFile(
                join(posts, `nested/entry-${id}.mdx`),
                `---\n${JSON.stringify({ title: `記録${id}`, description: `概要${id}`, date: index === 1 ? "2026-09-02" : "2026-09-01", tags: ["typescript"], draft: false })}\n---\n\n記事の本文。\n`,
            );
        }
        build();
        await page.setContent(await html());
        assert.equal(
            await page.getByRole("article").count(),
            Math.min(count, 10),
        );
        assert.equal(
            await page.getByRole("navigation", { name: "ページ送り" }).count(),
            count > 10 ? 1 : 0,
        );
        assert.equal(
            await page
                .getByText("すべての記事を見る", { exact: false })
                .count(),
            0,
            "ホームに無効な全件リンクを残さない",
        );
        await assert.rejects(html("page/1"), { code: "ENOENT" });
        if (count <= 10)
            await assert.rejects(html("page/2"), { code: "ENOENT" });
        if (count === 0)
            assert.equal(
                await page
                    .getByText("公開記事はまだありません。", { exact: true })
                    .count(),
                1,
            );
        if (count) {
            assert.deepEqual(
                await page.locator("article h2").allTextContents(),
                [
                    "記録01",
                    "記録02",
                    "記録03",
                    "記録04",
                    "記録05",
                    "記録06",
                    "記録07",
                    "記録08",
                    "記録09",
                    "記録10",
                ],
            );
            assert.equal(await page.locator("article img").count(), 0);
            assert.equal(
                await page
                    .locator("article")
                    .first()
                    .locator("p")
                    .first()
                    .textContent(),
                "概要01",
            );
            assert.equal(
                await page.locator("article h2 a").first().getAttribute("href"),
                "/posts/nested/entry-01/",
            );
            assert.equal(
                await page.locator("article a").first().getAttribute("href"),
                "/tags/typescript/",
            );
        }
        if (count === 11) {
            assert.equal(
                await page
                    .getByRole("link", { name: "次のページ →" })
                    .getAttribute("href"),
                "/page/2/",
            );
            assert.equal(
                await page.getByText("11件中 1–10件を表示").count(),
                1,
            );
            await page.setContent(await html("page/2"));
            assert.deepEqual(
                await page.locator("article h2").allTextContents(),
                ["記録11"],
            );
            assert.equal(
                await page
                    .getByRole("link", { name: "← 前のページ" })
                    .getAttribute("href"),
                "/",
            );
            assert.equal(
                await page.getByRole("link", { name: "次のページ →" }).count(),
                0,
            );
            assert.equal(
                await page.getByText("11件中 11–11件を表示").count(),
                1,
            );
            assert.equal(
                await page.getByLabel("2ページ中2ページ目").textContent(),
                "2 / 2",
            );
            await assert.rejects(html("page/3"), { code: "ENOENT" });
        }
        if (count === 21) {
            await page.setContent(await html("page/2"));
            assert.deepEqual(
                await page.locator("article h2").allTextContents(),
                [
                    "記録11",
                    "記録12",
                    "記録13",
                    "記録14",
                    "記録15",
                    "記録16",
                    "記録17",
                    "記録18",
                    "記録19",
                    "記録20",
                ],
            );
            assert.equal(
                await page
                    .getByRole("link", { name: "← 前のページ" })
                    .getAttribute("href"),
                "/",
            );
            assert.equal(
                await page
                    .getByRole("link", { name: "次のページ →" })
                    .getAttribute("href"),
                "/page/3/",
            );
            assert.equal(
                await page.getByText("21件中 11–20件を表示").count(),
                1,
            );
            await page.setContent(await html("page/3"));
            assert.deepEqual(
                await page.locator("article h2").allTextContents(),
                ["記録21"],
            );
            assert.equal(
                await page
                    .getByRole("link", { name: "← 前のページ" })
                    .getAttribute("href"),
                "/page/2/",
            );
            assert.equal(
                await page.getByRole("link", { name: "次のページ →" }).count(),
                0,
            );
            assert.equal(
                await page.getByText("21件中 21–21件を表示").count(),
                1,
            );
            await assert.rejects(html("page/4"), { code: "ENOENT" });
            await page.setContent(await html("archives/2026-09"));
            assert.equal(await page.getByRole("article").count(), 21);
            assert.equal(
                await page
                    .getByRole("navigation", { name: "ページ送り" })
                    .count(),
                0,
            );
        }
    }
    await checkNavigation(browser);
} finally {
    await browser.close();
}
console.log(
    "Home checks passed: public articles, stable order, optional images, 0/10/11/21 articles, monthly archive and keyboard navigation at 1280/390/320px in both themes.",
);

async function checkNavigation(browser) {
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
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--ignore-lock",
        ],
        { cwd: fixture },
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
                ready = (
                    await fetch(base, { signal: AbortSignal.timeout(3000) })
                ).ok;
            } catch {
                /* Wait for our own fixture preview server. */
            }
            if (!ready) await setTimeout(100);
        }
        assert(ready, log);
        for (const width of [1280, 390, 320]) {
            for (const colorScheme of ["light", "dark"]) {
                const page = await browser.newPage({
                    viewport: { width, height: 844 },
                    colorScheme,
                    javaScriptEnabled: true,
                });
                try {
                    await page.goto(base);
                    const next = page.getByRole("link", {
                        name: "次のページ →",
                    });
                    await next.focus();
                    await expect(next).toBeFocused();
                    await next.press("Enter");
                    await expect(page).toHaveURL(`${base}/page/2/`);
                    const header = page.getByRole("banner");
                    await expect(
                        header
                            .getByRole("navigation", { name: "メイン" })
                            .locator("a[aria-current=page]"),
                    ).toHaveText("記事");
                    await expect(
                        page.getByRole("searchbox", { includeHidden: true }),
                    ).toHaveCount(0);
                    await expect(
                        page.getByRole("button", {
                            name: /検索/,
                            includeHidden: true,
                        }),
                    ).toHaveCount(0);
                    await expect(
                        page.getByRole("dialog", {
                            name: "記事検索",
                            includeHidden: true,
                        }),
                    ).toHaveCount(0);
                    await expect(page.getByRole("article")).toHaveCount(10);
                    await expect(
                        page.getByLabel("3ページ中2ページ目"),
                    ).toHaveText("2 / 3");
                    await expect(page).toHaveTitle(
                        "記事 - 2ページ目 | devegoma's blog",
                    );
                    const navigation = page.getByRole("navigation", {
                        name: "ページ送り",
                    });
                    for (const link of await navigation
                        .getByRole("link")
                        .all()) {
                        await expect(link).toBeVisible();
                        const box = await link.boundingBox();
                        assert(box.width >= 44 && box.height >= 44);
                    }
                    assert(
                        await page.evaluate(
                            () =>
                                document.documentElement.scrollWidth <=
                                innerWidth,
                        ),
                    );
                    await expect(page.locator("body")).toHaveCSS(
                        "background-color",
                        colorScheme === "dark"
                            ? "rgb(16, 28, 36)"
                            : "rgb(243, 247, 248)",
                    );
                    await page.screenshot({
                        path: join(fixture, `home-${width}-${colorScheme}.png`),
                        fullPage: true,
                    });
                    await next.click();
                    await expect(page).toHaveURL(`${base}/page/3/`);
                    await expect(page.locator("article h2")).toHaveText([
                        "記録21",
                    ]);
                    await expect(next).toHaveCount(0);
                    const previous = page.getByRole("link", {
                        name: "← 前のページ",
                    });
                    await previous.click();
                    await expect(page).toHaveURL(`${base}/page/2/`);
                    await previous.click();
                    await expect(page).toHaveURL(`${base}/`);
                    await expect(previous).toHaveCount(0);
                    for (const path of ["/page/1/", "/page/4/"]) {
                        const response = await page.goto(base + path);
                        assert.equal(response.status(), 404);
                    }
                } finally {
                    await page.close();
                }
            }
        }
    } finally {
        if (server.exitCode === null) {
            const exited = once(server, "exit");
            server.kill();
            await exited;
        }
    }
}
