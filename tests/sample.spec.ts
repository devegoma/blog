import { expect, test } from "@playwright/test";

test("トップから記事を読み、トップに戻れる", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("記事 | devegoma's blog");
    const heading = page.getByRole("heading", { name: "最近の記録" });
    await expect(heading).toBeVisible();
    await page
        .getByRole("link", { name: "読書メモを、あとから使える形にする" })
        .click();
    await expect(page).toHaveURL(/\/posts\/sample\/$/);
    await expect(
        page.getByRole("heading", {
            name: "読書メモを、あとから使える形にする",
            exact: true,
        }),
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
