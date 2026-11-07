import { expect, test } from "@playwright/test";

const screens = [
    ["/", "記事"],
    ["/posts/sample/", "記事"],
    ["/archives/2026-10/", "記事"],
    ["/tags/", "タグ"],
    ["/tags/typescript/", "タグ"],
    ["/about/", "このブログについて"],
    ["/missing-page/", null],
] as const;

test("全画面の共通ヘッダーから移動でき、画面に応じたナビを選択表示する", async ({
    page,
}) => {
    for (const [path, active] of screens) {
        await page.goto(path);
        const header = page.getByRole("banner");
        const logo = header.getByRole("link", {
            name: "devegoma’s blog ホーム",
        });
        const navigation = header.getByRole("navigation", { name: "メイン" });
        await expect(logo).toHaveAttribute("href", "/");
        await expect(navigation.getByRole("link")).toHaveText([
            "記事",
            "タグ",
            "このブログについて",
        ]);
        for (const [name, href] of [
            ["記事", "/"],
            ["タグ", "/tags/"],
            ["このブログについて", "/about/"],
        ]) {
            await expect(
                navigation.getByRole("link", { name, exact: true }),
            ).toHaveAttribute("href", href);
        }
        const current = navigation.locator("a[aria-current=page]");
        if (active) await expect(current).toHaveText(active);
        else await expect(current).toHaveCount(0);
        const logoBox = (await logo.boundingBox())!;
        const navBox = (await navigation.boundingBox())!;
        const toggleBox = (await header
            .getByRole("button", { name: /モードに切り替える/ })
            .boundingBox())!;
        expect(navBox.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height);
        expect(toggleBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
        expect(toggleBox.y + toggleBox.height / 2).toBeCloseTo(
            logoBox.y + logoBox.height / 2,
            0,
        );
    }
    await page
        .getByRole("banner")
        .getByRole("link", { name: "devegoma’s blog ホーム" })
        .click();
    await expect(page).toHaveURL("/");
});

test("共通ヘッダーは1199px以下でモバイル表示になり、スクロールで画面外へ流れる", async ({
    page,
    viewport,
}) => {
    test.skip(viewport!.width !== 390, "各ブラウザで境界幅を一度確認する");
    for (const [width, height] of [
        [320, 64],
        [1199, 64],
        [1200, 80],
        [1920, 80],
    ]) {
        await page.setViewportSize({ width, height: 720 });
        await page.goto("/posts/sample/");
        await page.evaluate(() => document.fonts.ready);
        const header = page.getByRole("banner");
        const logo = (await header
            .getByRole("link", { name: "devegoma’s blog ホーム" })
            .boundingBox())!;
        const toggle = (await header
            .getByRole("button", { name: /モードに切り替える/ })
            .boundingBox())!;
        const nav = (await header
            .getByRole("navigation", { name: "メイン" })
            .boundingBox())!;
        expect(nav.y).toBe(height);
        expect(toggle.x).toBeGreaterThanOrEqual(logo.x + logo.width);
        expect(toggle.width).toBeGreaterThanOrEqual(44);
        expect(toggle.height).toBeGreaterThanOrEqual(44);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.evaluate(() => scrollTo(0, 400));
        await expect
            .poll(async () => {
                const box = (await header.boundingBox())!;
                return box.y + box.height;
            })
            .toBeLessThanOrEqual(0);
    }
});

test("全画面で端末の配色に追従し、手動選択後は端末変更より読者の選択を優先する", async ({
    page,
}) => {
    for (const [path] of screens) {
        await page.emulateMedia({ colorScheme: "light" });
        await page.goto(path);
        await expect(page.locator("body")).toHaveCSS(
            "background-color",
            "rgb(243, 247, 248)",
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await expect(page.locator("body")).toHaveCSS(
            "background-color",
            "rgb(16, 28, 36)",
        );
        await expect(
            page.getByRole("button", { name: "ライトモードに切り替える" }),
        ).toBeVisible();
    }
    await page
        .getByRole("button", { name: "ライトモードに切り替える" })
        .press("Enter");
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    for (const [path] of screens) {
        await page.goto(path);
        await expect(page.locator("body")).toHaveCSS(
            "background-color",
            "rgb(243, 247, 248)",
        );
        await expect(
            page.getByRole("button", { name: "ダークモードに切り替える" }),
        ).toBeVisible();
        await expect(
            page.getByRole("button", { name: /端末.*戻|OS.*戻/ }),
        ).toHaveCount(0);
    }
    await page.reload();
    await expect(
        page.getByRole("button", { name: "ダークモードに切り替える" }),
    ).toBeVisible();
});

test("本文と日付・コードに指定フォントを適用し、フォントをサイト内から配信する", async ({
    page,
}) => {
    const fonts: { url: string; ok: boolean }[] = [];
    page.on("response", (response) => {
        if (response.request().resourceType() === "font") {
            fonts.push({ url: response.url(), ok: response.ok() });
        }
    });
    await page.goto("/posts/sample/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("body")).toHaveCSS(
        "font-family",
        /^"?DM Sans"?, "?Noto Sans JP"?, sans-serif$/,
    );
    await expect(page.locator("time").first()).toHaveCSS(
        "font-family",
        /^"?IBM Plex Mono"?, monospace$/,
    );
    await expect(page.locator("pre code").first()).toHaveCSS(
        "font-family",
        /^"?IBM Plex Mono"?, monospace$/,
    );
    page.removeAllListeners("response");
    expect(fonts.every((font) => font.ok)).toBe(true);
    const origin = new URL(page.url()).origin;
    expect(fonts.map((font) => new URL(font.url).pathname).sort()).toEqual([
        "/fonts/dm-sans.ttf",
        "/fonts/ibm-plex-mono.ttf",
        "/fonts/noto-sans-jp.ttf",
    ]);
    expect(fonts.every((font) => new URL(font.url).origin === origin)).toBe(
        true,
    );
    expect(
        await page.evaluate(() =>
            ['"DM Sans"', '"Noto Sans JP"', '"IBM Plex Mono"'].every((family) =>
                document.fonts.check(`16px ${family}`),
            ),
        ),
    ).toBe(true);
    for (const [path] of screens) {
        await page.goto(path);
        await expect(page.locator("body")).toHaveCSS(
            "font-family",
            /^"?DM Sans"?, "?Noto Sans JP"?, sans-serif$/,
        );
    }
});
