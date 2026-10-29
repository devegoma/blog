import { expect, test } from "@playwright/test";

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

test("保存が使えなくても切り替えられ、ボタンをタグの下で操作できる", async ({
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
    for (const name of ["TypeScript", "Astro", "Obsidian"]) {
        const tag = (await page
            .getByRole("link", { name, exact: true })
            .boundingBox())!;
        expect(tag.y + tag.height).toBeLessThanOrEqual(box.y);
    }
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
    const mobile = viewport!.width < 768;
    for (const image of await page.locator("article img").all()) {
        if (mobile) {
            await expect(image).toBeHidden();
        } else {
            await expect(image).toBeVisible();
            const box = (await image.boundingBox())!;
            expect(box.width / box.height).toBeCloseTo(16 / 9, 3);
            expect(box.width).toBeLessThanOrEqual(320);
            const row = (await image.locator("..").boundingBox())!;
            expect(box.y - row.y).toBeGreaterThanOrEqual(20);
            expect(
                row.y + row.height - box.y - box.height,
            ).toBeGreaterThanOrEqual(20);
        }
    }
    if (mobile) {
        const nav = (await page
            .getByRole("navigation", { name: "メイン" })
            .boundingBox())!;
        const tags = (await page
            .getByRole("region", { name: "タグと表示設定" })
            .boundingBox())!;
        const articles = (await page.getByRole("main").boundingBox())!;
        const profile = (await page
            .getByRole("region", { name: "devegoma", exact: true })
            .boundingBox())!;
        expect(nav.y + nav.height).toBeLessThanOrEqual(tags.y);
        expect(tags.y + tags.height).toBeLessThanOrEqual(articles.y);
        expect(articles.y + articles.height).toBeLessThanOrEqual(profile.y);
    }
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});
