import { expect, test } from "@playwright/test";

test("タグの選択・変更・解除と記事詳細への移動", async ({ page, viewport }) => {
    await page.goto("/");
    await page
        .getByRole("navigation", { name: "メイン" })
        .getByRole("link", { name: "タグ", exact: true })
        .click();
    await expect(
        page.getByRole("heading", { name: "タグから探す" }),
    ).toBeVisible();
    const choices = page.getByRole("navigation", { name: "タグを選ぶ" });
    await expect(choices.getByRole("link")).toHaveText([
        /#\s*Astro\s*1件/,
        /#\s*Obsidian\s*1件/,
        /#\s*TypeScript\s*1件/,
    ]);
    await expect(page.getByRole("article")).toHaveCount(0);
    await choices.getByRole("link", { name: "TypeScript 1件" }).press("Enter");
    await expect(page).toHaveURL("/tags/typescript/");
    await expect(
        page.getByRole("heading", { name: "TypeScriptの記事" }),
    ).toBeVisible();
    await expect(choices.locator('[aria-current="page"]')).toHaveText(
        /✓\s*TypeScript\s*1件/,
    );
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("button", { name: /新しい順/ })).toHaveCount(0);
    await expect(
        page.getByRole("navigation", { name: "ページ送り" }),
    ).toHaveCount(0);
    const chooser = (await page.locator(".tag-chooser").boundingBox())!;
    const list = (await page.locator(".article-list").boundingBox())!;
    const title = (await page.locator(".tag-page-title").boundingBox())!;
    expect(title.x).toBeCloseTo(
        (await page.locator("main").boundingBox())!.x,
        0,
    );
    if (viewport!.width >= 1200) {
        expect(chooser.x + chooser.width).toBeLessThan(list.x);
        expect(chooser.y).toBeCloseTo(list.y, 0);
    } else expect(chooser.y + chooser.height).toBeLessThan(list.y);
    await page
        .getByRole("article")
        .getByRole("link", { name: "小さな自動化を試した記録" })
        .click();
    await expect(page).toHaveURL("/posts/automation/");
    await page.goBack();
    await choices.getByRole("link", { name: "Obsidian 1件" }).click();
    await expect(page).toHaveURL("/tags/obsidian/");
    await expect(page.getByRole("article")).toContainText(
        "読書メモを、あとから使える形にする",
    );
    await page.getByRole("link", { name: "選択を解除 ×" }).click();
    await expect(page).toHaveURL("/tags/");
    await expect(page.locator(".tag-option[aria-current]")).toHaveCount(0);
    for (const path of [
        "/tags/unknown/",
        "/tags/draft-only/",
        "/tags/typescript/page/1/",
        "/tags/typescript/page/2/",
    ]) {
        expect((await page.goto(path))!.status()).toBe(404);
    }
});

test("タグはモバイル3件・PC10件を超えるとキーボードで開閉できる", async ({
    page,
    viewport,
}) => {
    let count = 3;
    // Supply extra choices without adding sample tags to the published content.
    await page.route("**/tags/", async (route) => {
        const response = await route.fetch();
        const extra = Array.from(
            { length: count - 3 },
            (_, index) =>
                `<a class="tag-option" href="/tags/test-${index}/"><span class="tag-name">追加タグ ${index + 1}</span><span class="tag-count">1件</span></a>`,
        ).join("");
        const body = (await response.text()).replace(
            /(<nav id="tag-options"[^>]*>)([\s\S]*?)(<\/nav>)/,
            `$1$2${extra}$3`,
        );
        await route.fulfill({ response, body });
    });
    const limit = viewport!.width >= 1200 ? 10 : 3;
    for (count of [3, 4, 10, 11]) {
        await page.goto("/tags/");
        const toggle = page.locator(".tag-more");
        const visible = page.locator(".tag-option:visible");
        await expect(visible).toHaveCount(Math.min(count, limit));
        if (count <= limit) {
            await expect(toggle).toBeHidden();
            continue;
        }
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await toggle.focus();
        await toggle.press("Enter");
        await expect(visible).toHaveCount(count);
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await toggle.press("Space");
        await expect(visible).toHaveCount(limit);
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(toggle).toBeFocused();
    }
});

test("両配色・320pxでもタグと記事を読め、JavaScriptなしでも移動できる", async ({
    page,
    browser,
    baseURL,
}) => {
    for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        for (const path of ["/tags/", "/tags/typescript/"]) {
            await page.goto(path);
            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator("html")).toHaveAttribute(
                "data-theme",
                theme,
            );
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            for (const link of await page
                .locator(".tag-option, .tag-clear, .tag-back, .result-tags a")
                .all()) {
                expect(
                    (await link.boundingBox())!.height,
                ).toBeGreaterThanOrEqual(44);
            }
            for (const image of await page.locator("article img").all()) {
                const box = (await image.boundingBox())!;
                expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
            }
        }
    }
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/tags/typescript/");
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
    });
    const plain = await context.newPage();
    await plain.goto("/tags/");
    await plain
        .getByRole("navigation", { name: "タグを選ぶ" })
        .getByRole("link", { name: "TypeScript 1件" })
        .click();
    await expect(
        plain.getByRole("heading", { name: "TypeScriptの記事" }),
    ).toBeVisible();
    await context.close();
});
