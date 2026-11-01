import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, unlink, readdir } from "node:fs/promises";
import { chromium, firefox, expect } from "@playwright/test";

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4335";
// Keep the reference captures intact when repeating verification.
const output = new URL(process.env.PREVIEW_OUTPUT ?? "./", import.meta.url);
const root = new URL("../../", import.meta.url);
const fixture = new URL("src/content/posts/issue-15-preview-check.mdx", root);
const results = [];
await mkdir(output, { recursive: true });
await writeFile(
    fixture,
    `---
title: 記事を公開する前に、読み心地を確かめる
date: "2026-11-01"
tags: [astro, draft-only]
---

書きかけの記事を、公開時と同じレイアウトで読み返します。文章の流れや見出しの間隔を、手元の画面で確かめるための下書きです。

## 本文の見え方を確認する

いつもの書体と余白で読むと、編集画面では気づかなかったことが見えてきます。パソコンとスマートフォンの両方で、自然に読み進められるか確認します。

### 小さな画面でも読みやすく

長い見出しやタグが折り返されること、目次から本文へ移動できることを確かめます。

## 公開する前に読み返す

このページはローカルでの表示確認用です。内容が整うまでは下書きのまま保存します。
`,
    { flag: "wx" },
);
try {
    await expect
        .poll(
            async () => {
                const response = await fetch(
                    `${base}/posts/issue-15-preview-check/`,
                );
                return response.status;
            },
            { timeout: 20000 },
        )
        .toBe(200);
    for (const engine of process.env.CAPTURE_ONLY
        ? [chromium]
        : [chromium, firefox]) {
        const browser = await engine.launch();
        try {
            for (const width of [1440, 390, 320]) {
                for (const theme of ["light", "dark"]) {
                    const context = await browser.newContext({
                        viewport: { width, height: width > 1000 ? 1000 : 844 },
                        colorScheme: theme,
                    });
                    const page = await context.newPage();
                    await page.goto(`${base}/posts/issue-15-preview-check/`, {
                        waitUntil: "networkidle",
                    });
                    await expect(page.locator(".draft-notice")).toBeVisible();
                    await page.evaluate(() => document.fonts.ready);
                    await page.addStyleTag({
                        content:
                            "astro-dev-toolbar { display: none !important; }",
                    });
                    await expect(page.locator(".article-meta")).toContainText(
                        "公開日（設定値）",
                    );
                    assert.equal(
                        await page.locator(".article-pagination").count(),
                        0,
                    );
                    assert.equal(
                        await page.locator(".article-tags a").count(),
                        0,
                    );
                    assert.equal(
                        await page.evaluate(
                            () =>
                                document.documentElement.scrollWidth >
                                innerWidth,
                        ),
                        false,
                    );
                    if (engine === chromium)
                        await page.screenshot({
                            path: new URL(
                                `${width}-${theme}.png`,
                                output,
                            ).pathname.replace(/^\/(\w:)/, "$1"),
                            fullPage: true,
                        });
                    if (width < 1200) {
                        await page.locator(".mobile-toc summary").click();
                        await expect(
                            page.locator(".mobile-toc .toc"),
                        ).toBeVisible();
                    }
                    await page.locator("[data-theme-toggle]").click();
                    await expect(page.locator("html")).toHaveAttribute(
                        "data-theme",
                        theme === "light" ? "dark" : "light",
                    );
                    await page.goto(`${base}/posts/draft-preview/`);
                    await expect(page.locator(".draft-notice")).toBeVisible();
                    assert.equal(
                        await page.locator(".article-meta time").count(),
                        0,
                    );
                    await page.goto(`${base}/posts/sample/`);
                    assert.equal(
                        await page.locator(".draft-notice").count(),
                        0,
                    );
                    await expect(
                        page.locator(".article-pagination"),
                    ).toBeVisible();
                    assert((await page.locator(".article-tags a").count()) > 0);
                    results.push({
                        browser: engine.name(),
                        width,
                        theme,
                        result: "passed",
                    });
                    await context.close();
                }
            }
            for (const width of [1199, 1200]) {
                const page = await browser.newPage({
                    viewport: { width, height: 1000 },
                });
                await page.goto(`${base}/posts/issue-15-preview-check/`);
                assert.equal(
                    await page.locator(".mobile-toc").isVisible(),
                    width === 1199,
                );
                assert.equal(
                    await page.locator(".article-toc").isVisible(),
                    width === 1200,
                );
                const author = await page
                    .locator(".article-author")
                    .boundingBox();
                const article = await page
                    .locator(".article-paper")
                    .boundingBox();
                assert(author && article);
                if (width === 1199)
                    assert(author.y >= article.y + article.height);
                else assert(author.x + author.width <= article.x);
                await page.close();
            }
            const page = await browser.newPage({
                javaScriptEnabled: false,
                viewport: { width: 390, height: 844 },
            });
            await page.goto(`${base}/posts/draft-preview/`);
            await expect(page.locator(".draft-notice")).toBeVisible();
            await page.locator(".article-end a").click();
            await expect(page).toHaveURL(`${base}/`);
            await page.close();
        } finally {
            await browser.close();
        }
    }
    // Inspect the real production output, including the draft body marker.
    const dist = new URL("dist/", root);
    await assert.rejects(
        readFile(new URL("posts/draft-preview/index.html", dist)),
        { code: "ENOENT" },
    );
    for (const path of await readdir(dist, { recursive: true })) {
        if (!/\.(html|js|json)$/.test(path)) continue;
        const content = await readFile(
            new URL(path.replaceAll("\\", "/"), dist),
            "utf8",
        );
        assert(!content.includes("DRAFT_PREVIEW_ONLY_CONTENT"), path);
        if (path.endsWith(".html"))
            assert(!content.includes('class="draft-notice"'), path);
    }
    if (!process.env.CAPTURE_ONLY)
        await writeFile(
            new URL("verification.json", output),
            JSON.stringify(results, null, 4) + "\n",
        );
    console.log(
        `${results.length} layouts passed; date/no-date drafts, published article, theme, TOC, no-JS navigation and production omission passed.`,
    );
} finally {
    await unlink(fixture);
}
