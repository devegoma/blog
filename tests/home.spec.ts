import { expect, test } from "@playwright/test";

test("検索は準備中と分かり、モバイルでは開閉して元のボタンへ戻れる", async ({
    page,
    viewport,
}) => {
    await page.goto("/");
    const input = page.getByRole("searchbox", { name: "記事を検索（準備中）" });
    if (viewport!.width <= 899) {
        const open = page.getByRole("button", { name: "検索を開く" });
        await expect(open).toBeVisible();
        const box = (await open.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        await expect(input).toBeHidden();
        await open.press("Enter");
        const dialog = page.getByRole("dialog", { name: "記事検索" });
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByText(
                "検索は準備中です。記事を探す機能は今後追加します。",
            ),
        ).toBeVisible();
        const close = dialog.getByRole("button", { name: "閉じる" });
        await expect(close).toBeFocused();
        await expect(input).toBeDisabled();
        await close.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(open).toBeFocused();
        await open.press("Space");
        await close.click();
        await expect(dialog).toBeHidden();
        await expect(open).toBeFocused();
    } else {
        await expect(input).toBeVisible();
        await expect(input).toBeDisabled();
        await expect(input).toHaveAttribute("placeholder", "検索は準備中");
        await expect(
            page.getByRole("button", { name: "検索を開く" }),
        ).toBeHidden();
    }
});

test("ホームに記事一覧・プロフィール・未実装の導線が表示される", async ({
    page,
}) => {
    await page.goto("/");
    await expect(
        page.getByRole("heading", { name: "最近の記録" }),
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "devegoma", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(
        page.getByRole("navigation", { name: "メイン" }),
    ).toBeVisible();
    await expect(
        page.getByRole("link", { name: "RSS（準備中）", exact: true }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
        page.getByRole("link", { name: "GitHub", exact: true }),
    ).toHaveAttribute("href", "https://github.com/devegoma");
    await expect(
        page.getByRole("link", { name: "X", exact: true }),
    ).toHaveAttribute("href", "https://x.com/devegoma");
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
    await expect(
        page.getByText("開発用サンプル", { exact: false }),
    ).toBeVisible();
});

test("OSの配色から始まり、キーボードで切り替えた選択を再訪時も保持する", async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const button = page.getByRole("button", {
        name: "ライトモードに切り替える",
    });
    await expect(button).toBeVisible();
    const dark = await page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor);
    expect(dark).toBe("rgb(16, 28, 36)");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(
        page.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
    const light = await page
        .locator("body")
        .evaluate((body) => getComputedStyle(body).backgroundColor);
    expect(dark).not.toBe(light);
    await page.emulateMedia({ colorScheme: "dark" });
    await button.focus();
    await expect(button).toBeFocused();
    await button.press("Enter");
    await expect(
        page.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", light);
});

test("保存が使えなくてもヘッダーのボタンで配色を切り替えられる", async ({
    page,
}) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => {
            throw new DOMException("Blocked", "SecurityError");
        };
        Storage.prototype.setItem = () => {
            throw new DOMException("Blocked", "SecurityError");
        };
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const button = page.getByRole("button", {
        name: "ダークモードに切り替える",
    });
    await button.focus();
    await expect(button).toBeFocused();
    expect(
        await button.evaluate(
            (element) => getComputedStyle(element).outlineStyle,
        ),
    ).not.toBe("none");
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    const header = page.getByRole("banner");
    await expect(
        header.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
    const logo = (await header
        .getByRole("link", { name: "devegoma’s blog ホーム" })
        .boundingBox())!;
    expect(logo.x + logo.width).toBeLessThanOrEqual(box.x);
    expect(
        Math.abs(logo.y + logo.height / 2 - box.y - box.height / 2),
    ).toBeLessThan(2);
    await button.press("Space");
    await expect(
        page.getByRole("button", { name: "ライトモードに切り替える" }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
});

test("画面幅に応じて記事画像とナビ・タグ・プロフィールが読みやすく並ぶ", async ({
    page,
    viewport,
}) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const mobile = viewport!.width <= 899;
    for (const image of await page.locator("article img").all()) {
        await expect(image).toBeVisible();
        const box = (await image.boundingBox())!;
        expect(box.width / box.height).toBeCloseTo(16 / 9, 2);
        expect(box.width).toBeLessThanOrEqual(mobile ? 140 : 320);
        const row = (await image.locator("..").boundingBox())!;
        expect(box.y - row.y).toBeGreaterThanOrEqual(20);
        expect(row.y + row.height - box.y - box.height).toBeGreaterThanOrEqual(
            20,
        );
    }
    const header = page.getByRole("banner");
    const nav = (await header
        .getByRole("navigation", { name: "メイン" })
        .boundingBox())!;
    const logo = (await header
        .getByRole("link", { name: "devegoma’s blog ホーム" })
        .boundingBox())!;
    expect(nav.y).toBeGreaterThanOrEqual(logo.y + logo.height);
    await expect(
        header.getByRole("link", { name: "このブログについて" }),
    ).toBeVisible();
    if (mobile) {
        const tags = (await page
            .getByRole("region", { name: "タグ", exact: true })
            .boundingBox())!;
        const articles = (await page.getByRole("main").boundingBox())!;
        const profile = (await page
            .getByRole("region", { name: "devegoma", exact: true })
            .boundingBox())!;
        expect(nav.y + nav.height).toBeLessThanOrEqual(profile.y);
        expect(profile.y + profile.height).toBeLessThanOrEqual(articles.y);
        expect(articles.y + articles.height).toBeLessThanOrEqual(tags.y);
    }
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});
