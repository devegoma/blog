import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("ホームからプロフィールを開き、外部リンクを確認して戻れる", async ({
    page,
}) => {
    await page.goto("/");
    await page
        .getByRole("link", { name: "このブログについて", exact: true })
        .click();
    await expect(page).toHaveURL("/about/");
    await expect(page).toHaveTitle("このブログについて | devegoma's blog");
    await expect(
        page
            .getByRole("navigation", { name: "メイン" })
            .getByRole("link", { name: "このブログについて" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "このブログについて",
    );
    await expect(page.locator(".intro")).toHaveText(
        /読んだ本、試した道具。\s*日々の学びを記録しています。/,
    );
    for (const [name, href] of [
        ["GitHub", "https://github.com/devegoma"],
        ["X", "https://x.com/devegoma"],
    ]) {
        const link = page.getByRole("link", {
            name: `${name} · devegoma（新しいタブで開く）`,
            exact: true,
        });
        await expect(link).toHaveAttribute("href", href);
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await link.focus();
        expect(
            await link.evaluate((el) => getComputedStyle(el).outlineStyle),
        ).toBe("solid");
    }
    await page.getByRole("link", { name: "ホームへ戻る" }).press("Enter");
    await expect(page).toHaveURL("/");
});

test("PCとモバイルの両配色で収まり、長い紹介文でも外部リンクを操作できる", async ({
    page,
    browserName,
    viewport,
}) => {
    test.skip(viewport!.width !== 390, "各ブラウザで一度だけ全幅を確認する");
    await mkdir("output/profile-implementation", { recursive: true });
    for (const width of [320, 390, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: width < 1200 ? 844 : 900 });
        for (const theme of ["light", "dark"] as const) {
            await page.emulateMedia({ colorScheme: theme });
            await page.goto("/about/");
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
            await expect(page.locator(".about-card")).toHaveCSS(
                "display",
                width >= 1200 ? "grid" : "block",
            );
            const targets = await page
                .locator(".about-page a, .about-page button")
                .evaluateAll((nodes) =>
                    nodes
                        .filter(
                            (el) =>
                                el.getBoundingClientRect().width &&
                                !el.closest("dialog"),
                        )
                        .map((el) => {
                            const r = el.getBoundingClientRect();
                            return { width: r.width, height: r.height };
                        }),
                );
            expect(targets.every((r) => r.width >= 44 && r.height >= 44)).toBe(
                true,
            );
            await page.screenshot({
                path: `output/profile-implementation/${browserName}-${width}-${theme}.png`,
                fullPage: true,
            });
            await page.locator(".intro").evaluate((el) => {
                el.textContent =
                    "長い日本語の紹介文も読みやすく表示されることを確認します。".repeat(
                        12,
                    ) +
                    "https://example.invalid/" +
                    "long".repeat(60);
            });
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
            await expect(
                page.getByRole("link", {
                    name: "GitHub · devegoma（新しいタブで開く）",
                    exact: true,
                }),
            ).toBeVisible();
        }
        const toggle = page.getByRole("button", {
            name: "ライトモードに切り替える",
        });
        await toggle.press("Enter");
        await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            "light",
        );
        await page.evaluate(() => localStorage.removeItem("color-theme"));
    }
});

test("JavaScriptなしでもプロフィールとホームへの導線を使える", async ({
    browser,
    baseURL,
}) => {
    const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL,
    });
    try {
        const page = await context.newPage();
        await page.goto("/about/");
        await expect(
            page.getByRole("heading", { name: "devegoma", exact: true }),
        ).toBeVisible();
        await page.getByRole("link", { name: "ホームへ戻る" }).click();
        await expect(page).toHaveURL("/");
    } finally {
        await context.close();
    }
});
