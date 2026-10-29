import { expect, test } from "@playwright/test";

test("トップから MDX 記事を読み、トップに戻れる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("環境構築サンプル | devegoma's blog");
    const heading = page.getByRole("heading", { name: "環境構築サンプル" });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-weight", "700");
    await page.getByRole("link", { name: "MDX サンプルを読む" }).click();
    await expect(page).toHaveURL(/\/posts\/sample\/$/);
    await expect(
        page.getByRole("heading", { name: "MDX サンプル", exact: true }),
    ).toBeVisible();
    await expect(page.locator("pre code")).toContainText("Hello, Astro!");
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
        page.getByRole("complementary", { name: "補足" }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page.getByRole("link", { name: "トップへ戻る" }).click();
    await expect(page).toHaveURL("/");
});
