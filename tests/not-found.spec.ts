import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

test("存在しないURLを404で案内し、ホームへ戻れる", async ({ page }) => {
    expect(await readFile("dist/404.html", "utf8")).toContain("error-title");
    for (const path of [
        "/missing-page/",
        "/posts/deleted-article/",
        "/posts/draft-preview/",
        "/tags/undefined-tag/",
        "/tags/draft-only/",
    ]) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(404);
        await expect(page).toHaveURL(path);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
            "ページが見つかりません",
        );
        await expect(page.locator(".main-nav [aria-current]")).toHaveCount(0);
        await expect(
            page.getByRole("link", { name: "ホームに戻る" }),
        ).toHaveAttribute("href", "/");
    }
    await page.keyboard.press("Tab");
    await page.getByRole("link", { name: "ホームに戻る" }).focus();
    await expect(page.locator(".home-action")).toHaveCSS(
        "outline-style",
        "solid",
    );
    await page.getByRole("link", { name: "ホームに戻る" }).press("Enter");
    await expect(page).toHaveURL("/");
});

test("404をPC・モバイルと両配色で表示できる", async ({
    page,
    browserName,
    viewport,
}) => {
    test.skip(viewport!.width !== 390, "各ブラウザで一度だけ全幅を確認する");
    await mkdir("output/issue-13-implementation", { recursive: true });
    for (const width of [320, 390, 1280, 1440]) {
        await page.setViewportSize({
            width,
            height: width < 1200 ? 844 : 1000,
        });
        for (const theme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto("/missing-page/");
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
            const centering = await page
                .locator(".error-panel")
                .evaluate((el) => {
                    const panel = el.getBoundingClientRect();
                    const main = el.closest("main")!.getBoundingClientRect();
                    return {
                        x: Math.abs(
                            panel.x + panel.width / 2 - main.x - main.width / 2,
                        ),
                        y: Math.abs(
                            panel.y +
                                panel.height / 2 -
                                main.y -
                                main.height / 2,
                        ),
                    };
                });
            expect(centering.x).toBeLessThan(1);
            expect(centering.y).toBeLessThan(1);
            await expect(page.locator(".error-panel")).toHaveCSS(
                "display",
                width >= 1200 ? "grid" : "block",
            );
            const targets = await page
                .locator(".not-found-page a, .not-found-page button")
                .evaluateAll((nodes) =>
                    nodes
                        .filter(
                            (el) =>
                                el.getBoundingClientRect().width &&
                                !el.closest("dialog"),
                        )
                        .map((el) => ({
                            width: el.getBoundingClientRect().width,
                            height: el.getBoundingClientRect().height,
                        })),
                );
            expect(targets.every((t) => t.width >= 44 && t.height >= 44)).toBe(
                true,
            );
            await page.screenshot({
                path: `output/issue-13-implementation/${browserName}-${width}-${theme}.png`,
                fullPage: true,
            });
            await page
                .locator(".error-description")
                .evaluate(
                    (el) =>
                        (el.textContent =
                            "長い日本語の案内文も折り返して読むことができます。".repeat(
                                12,
                            )),
                );
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
        }
        await page.locator("[data-theme-toggle]").press("Enter");
        await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            "light",
        );
        await page.evaluate(() => localStorage.removeItem("color-theme"));
    }
});

test("JavaScriptなしでも404からホームに戻れる", async ({
    browser,
    baseURL,
}) => {
    const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
    });
    try {
        const page = await context.newPage();
        expect((await page.goto("/missing-page/"))?.status()).toBe(404);
        await expect(page.locator("h1")).toHaveText("ページが見つかりません");
        await page.getByRole("link", { name: "ホームに戻る" }).click();
        await expect(page).toHaveURL("/");
    } finally {
        await context.close();
    }
});
