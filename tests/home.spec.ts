import { expect, test } from "@playwright/test";

test("表示順ボタンを押すたびにホーム・月別一覧の記事を並べ替えられる", async ({
    page,
}) => {
    for (const path of ["/", "/archives/2026-10/"]) {
        await page.goto(path);
        const sort = page.getByRole("button", { name: /新しい順|古い順/ });
        await expect(sort).toBeEnabled();
        await expect(sort).toHaveText("↓ 新しい順");
        const dates = page.locator("article time");
        const newestFirst = ["2026.10.28", "2026.10.21", "2026.10.14"];
        await expect(dates).toHaveText(newestFirst);
        await sort.click();
        await expect(sort).toHaveText("↑ 古い順");
        await expect(dates).toHaveText([...newestFirst].reverse());
        await sort.press("Enter");
        await expect(sort).toHaveText("↓ 新しい順");
        await expect(dates).toHaveText(newestFirst);
        await sort.press("Space");
        await expect(sort).toHaveText("↑ 古い順");
        await expect(dates).toHaveText([...newestFirst].reverse());
        await expect(page.getByRole("article")).toHaveCount(3);
        await expect(
            page.getByRole("link", {
                name: "読書メモを、あとから使える形にする",
            }),
        ).toHaveAttribute("href", "/posts/sample/");
    }
});

test("検索は準備中と分かり、モバイルでは開閉して元のボタンへ戻れる", async ({
    page,
    viewport,
}) => {
    await page.goto("/");
    const input = page.getByRole("searchbox", { name: "記事を検索（準備中）" });
    if (viewport!.width <= 1199) {
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
    for (const name of ["GitHub", "X"]) {
        const link = page.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
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
    const mobile = viewport!.width <= 1199;
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
        expect(profile.y + profile.height).toBeLessThanOrEqual(tags.y);
        expect(tags.y + tags.height).toBeLessThanOrEqual(articles.y);
    }
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
});

test("記事を中央に配置し、PCのプロフィールは記事上端からスクロールに追従する", async ({
    page,
    viewport,
}) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const list = (await page.locator(".article-list").boundingBox())!;
    expect(
        Math.abs(list.x + list.width / 2 - viewport!.width / 2),
    ).toBeLessThan(1);
    const profile = page.getByRole("region", { name: "devegoma", exact: true });
    const tags = page.getByRole("region", { name: "タグ", exact: true });
    const profileBox = (await profile.boundingBox())!;
    const tagsBox = (await tags.boundingBox())!;
    expect(tagsBox.x).toBeCloseTo(profileBox.x, 0);
    expect(tagsBox.y - profileBox.y - profileBox.height).toBeCloseTo(16, 0);
    if (viewport!.width <= 1199) {
        await expect(page.locator(".sidebar")).toHaveCSS("position", "static");
        return;
    }
    const initial = (await profile.boundingBox())!;
    expect(Math.abs(initial.y - list.y)).toBeLessThan(1);
    await page.setViewportSize({ width: viewport!.width, height: 600 });
    await page.evaluate((y) => window.scrollTo(0, y + 80), initial.y);
    await expect
        .poll(async () => (await profile.boundingBox())!.y)
        .toBeCloseTo(24, 0);
    const scrolledProfile = (await profile.boundingBox())!;
    const scrolledTags = (await tags.boundingBox())!;
    expect(
        scrolledTags.y - scrolledProfile.y - scrolledProfile.height,
    ).toBeCloseTo(16, 0);
    const scrolledList = (await page.locator(".article-list").boundingBox())!;
    expect(scrolledList.y).toBeLessThan(0);
    const footer = (await page.getByRole("contentinfo").boundingBox())!;
    const stuck = (await profile.boundingBox())!;
    expect(stuck.y + stuck.height).toBeLessThanOrEqual(footer.y);
});

test("月別アーカイブの件数と配置が正しく、月の記事からホームへ戻れる", async ({
    page,
    viewport,
}) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    const archives = page.getByRole("navigation", { name: "月別アーカイブ" });
    const monthLink = archives.getByRole("link", { name: "2026年10月 3件" });
    await expect(monthLink).toHaveAttribute("href", "/archives/2026-10/");
    const archiveBox = (await archives.boundingBox())!;
    const articles = (await page.getByRole("main").boundingBox())!;
    if (viewport!.width > 1199) {
        expect(archiveBox.x).toBeGreaterThanOrEqual(
            articles.x + articles.width,
        );
        expect(archiveBox.y).toBeCloseTo(articles.y, 0);
    } else {
        expect(archiveBox.y).toBeGreaterThanOrEqual(
            articles.y + articles.height,
        );
    }
    await monthLink.click();
    await expect(page).toHaveURL("/archives/2026-10/");
    await expect(page).toHaveTitle("2026年10月の記録 | devegoma's blog");
    await expect(
        page.getByRole("heading", { name: "2026年10月の記録" }),
    ).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(3);
    await expect(page.locator("article time")).toHaveText([
        "2026.10.28",
        "2026.10.21",
        "2026.10.14",
    ]);
    await expect(
        page
            .getByRole("navigation", { name: "月別アーカイブ" })
            .getByRole("link"),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "最近の記事に戻る" }).click();
    await expect(page).toHaveURL("/");
    await expect(
        page.getByRole("heading", { name: "最近の記録" }),
    ).toBeVisible();
    const missing = await page.goto("/archives/2026-09/");
    expect(missing!.status()).toBe(404);
});
