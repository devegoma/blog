import { expect, test } from "@playwright/test";

test("プロフィールのRSSリンクをキーボードで開いて購読先を取得できる", async ({
    page,
}) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: "RSSを購読", exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/rss.xml");
    await expect(link).not.toHaveAttribute("aria-disabled", "true");
    await expect(link).not.toHaveAttribute("target", "_blank");
    await link.focus();
    const responsePromise = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/rss.xml",
    );
    await link.press("Enter");
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(
        /(?:application|text)\/(?:rss\+)?xml/,
    );
    await expect(page).toHaveURL(/\/rss\.xml$/);
});

test("ホーム・月別一覧・記事から同じRSSを自動検出できる", async ({ page }) => {
    for (const path of ["/", "/archives/2026-10/", "/posts/sample/"]) {
        await page.goto(path);
        const discovery = page.locator(
            'head link[rel="alternate"][type="application/rss+xml"]',
        );
        await expect(discovery).toHaveCount(1);
        await expect(discovery).toHaveAttribute(
            "href",
            "https://blog.devegoma.com/rss.xml",
        );
        await expect(discovery).toHaveAttribute("title", "devegoma's blog");
        await expect(
            page.getByRole("link", { name: "RSSを購読", exact: true }),
        ).toHaveAttribute("href", "/rss.xml");
    }
});
