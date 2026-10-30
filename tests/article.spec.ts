import { expect, test } from "@playwright/test";

test("最下部まで読むと最後の目次が選択され、上へ戻ると選択も戻る", async ({
    page,
}) => {
    for (const path of ["/posts/automation/", "/posts/before-coding/"]) {
        if (path === "/posts/before-coding/") {
            await page.setViewportSize({
                ...page.viewportSize()!,
                height: 600,
            });
        }
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const toc = page.locator(".article-toc .toc");
        const links = toc.locator("a");
        await page.evaluate(() =>
            window.scrollTo(0, document.documentElement.scrollHeight),
        );
        await expect(links.last()).toHaveAttribute("aria-current", "location");
        await expect(toc.locator("[aria-current]")).toHaveCount(1);
        await expect(page.locator(".mobile-toc .toc a").last()).toHaveAttribute(
            "aria-current",
            "location",
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(links.first()).toHaveAttribute("aria-current", "location");
        await expect(links.last()).not.toHaveAttribute("aria-current");
    }
    // A page that fits entirely on screen should still start at the first item.
    await page.setViewportSize({ ...page.viewportSize()!, height: 2000 });
    await expect(page.locator(".article-toc .toc a").first()).toHaveAttribute(
        "aria-current",
        "location",
    );
});

test("記事詳細の配置・配色・目次・タグからの往復", async ({
    page,
    viewport,
}, testInfo) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/posts/automation/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveTitle(
        "小さな自動化を試した記録 | devegoma's blog",
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".article-meta time")).toHaveText([
        "2026.10.21",
        "2026.10.28",
    ]);
    await expect(
        page.locator(".article-body pre code span").first(),
    ).toBeVisible();
    const mobile = viewport!.width <= 1199;
    const toc = page.getByRole("navigation", {
        name: mobile ? "モバイル目次" : "目次",
        exact: true,
    });
    const author = (await page.locator(".article-author").boundingBox())!;
    const article = (await page.getByRole("main").boundingBox())!;
    if (mobile) {
        expect(author.y).toBeGreaterThanOrEqual(article.y + article.height);
        await expect(toc).toBeHidden();
        const summary = page.locator(".mobile-toc summary");
        await summary.focus();
        await summary.press("Enter");
    } else {
        expect(author.x + author.width).toBeLessThan(article.x);
        expect(author.y).toBeCloseTo(article.y, 0);
        const box = (await page.locator(".article-toc").boundingBox())!;
        expect(box.x).toBeGreaterThan(article.x + article.width);
    }
    await expect(toc).toBeVisible();
    await toc
        .getByRole("link", { name: "小さく試してみる", exact: true })
        .click();
    const target = page.getByRole("heading", {
        name: "小さく試してみる",
        exact: true,
    });
    await expect(page).toHaveURL(/#小さく試してみる$|#%/);
    await expect
        .poll(async () => (await target.boundingBox())!.y)
        .toBeLessThan(100);
    await expect(
        toc.getByRole("link", { name: "小さく試してみる", exact: true }),
    ).toHaveAttribute("aria-current", "location");
    await page.evaluate(() => window.scrollTo(0, 0));
    if (mobile) await page.locator(".mobile-toc summary").click();
    await page.screenshot({
        path: `output/issue-9-article-implementation/${testInfo.project.name}-light.png`,
        fullPage: true,
    });
    if (
        ["chromium-1280x720", "chromium-390x844"].includes(
            testInfo.project.name,
        )
    ) {
        await page.screenshot({
            path: `output/issue-9-article-implementation/${testInfo.project.name}-light-top.png`,
        });
    }
    await page
        .getByRole("button", { name: "ダークモードに切り替える" })
        .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
        path: `output/issue-9-article-implementation/${testInfo.project.name}-dark.png`,
        fullPage: true,
    });
    if (
        ["chromium-1280x720", "chromium-390x844"].includes(
            testInfo.project.name,
        )
    ) {
        await page.screenshot({
            path: `output/issue-9-article-implementation/${testInfo.project.name}-dark-top.png`,
        });
    }
    await page
        .locator(".article-tags")
        .getByRole("link", { name: "TypeScript", exact: true })
        .click();
    await expect(page).toHaveURL("/tags/typescript/");
    await expect(
        page.getByRole("heading", { name: "TypeScriptの記事" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#article-list article")).toHaveCount(1);
    await page
        .getByRole("link", { name: "小さな自動化を試した記録", exact: true })
        .click();
    await page.getByRole("link", { name: "← 記事一覧に戻る" }).click();
    await expect(page).toHaveURL("/");
});

test("更新日・タグなし、長い本文・コード・表、下書きと削除URLを扱える", async ({
    page,
}) => {
    await page.goto("/posts/before-coding/");
    await expect(page.locator(".article-meta time")).toHaveCount(1);
    await expect(page.locator(".article-tags")).toHaveCount(0);
    await page.goto("/posts/automation/");
    await page.setViewportSize({ width: 320, height: 720 });
    await page.evaluate(() => document.fonts.ready);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    const longCode = page.locator("pre").last();
    expect(
        await longCode.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
        ),
    ).toBe(true);
    await longCode.focus();
    await longCode.press("ArrowRight");
    await expect
        .poll(() => longCode.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    const table = page.getByRole("region", { name: "表（横スクロール可能）" });
    expect(
        await table.evaluate(
            (element) => element.scrollWidth > element.clientWidth,
        ),
    ).toBe(true);
    await table.focus();
    await table.press("ArrowRight");
    await expect
        .poll(() => table.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    await page
        .getByRole("button", { name: "コピー", exact: true })
        .first()
        .click();
    await expect(page.getByRole("status").first()).toHaveText(
        /コピーしました|コピーできませんでした/,
    );
    for (const path of [
        "/posts/draft-preview/",
        "/posts/deleted-article/",
        "/tags/draft-only/",
    ]) {
        expect((await page.goto(path))!.status()).toBe(404);
    }
});

test("記事本文へのスキップとJavaScriptなしの目次を使える", async ({
    browser,
}) => {
    const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4321/posts/automation/");
    await page.keyboard.press("Tab");
    await expect(
        page.getByRole("link", { name: "記事本文へ移動" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.locator(".mobile-toc summary").click();
    await page
        .getByRole("navigation", { name: "モバイル目次" })
        .getByRole("link", { name: "まとめ", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "まとめ", exact: true }),
    ).toBeInViewport();
    await expect(
        page.getByRole("button", { name: "コピー", exact: true }).first(),
    ).toBeHidden();
    await context.close();
});
