(async () => {
    const { chromium } = await import("@playwright/test");
    const { pathToFileURL } = await import("node:url");
    const path = await import("node:path");
    const assert = await import("node:assert/strict");
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const results = [];
        for (const width of [320, 390, 768, 1440]) {
            await page.setViewportSize({
                width,
                height: width < 700 ? 844 : 1100,
            });
            await page.goto(
                pathToFileURL(path.join(__dirname, "index.html")).href,
            );
            await page.evaluate(() => document.fonts.ready);
            const result = await page.evaluate(() => ({
                width: innerWidth,
                overflow: document.documentElement.scrollWidth > innerWidth,
                background: getComputedStyle(document.body).backgroundColor,
                bodyFont: getComputedStyle(document.body).fontFamily,
                metaFont: getComputedStyle(document.querySelector("time"))
                    .fontFamily,
                heading: getComputedStyle(document.querySelector(".entry h3"))
                    .fontSize,
                logoHeight: document
                    .querySelector(".wordmark")
                    .getBoundingClientRect().height,
                logoWidth: document
                    .querySelector(".wordmark")
                    .getBoundingClientRect().width,
                logoLoaded:
                    document.querySelector(".wordmark img").naturalWidth ===
                    2172,
                entries: document.querySelectorAll(".entry").length,
                dmSans: document.fonts.check('16px "DM Sans"'),
                noto: document.fonts.check('16px "Noto Sans JP"'),
                mono: document.fonts.check('12px "IBM Plex Mono"'),
            }));
            assert.equal(
                result.overflow,
                false,
                `Horizontal overflow at ${width}px`,
            );
            assert.equal(result.background, "rgb(32, 71, 239)");
            assert.equal(result.entries, 3);
            assert.ok(result.logoHeight >= 58);
            assert.ok(result.logoLoaded);
            assert.ok(
                result.logoHeight >= (result.logoWidth * 366) / 2172,
                "Logo is vertically clipped",
            );
            if (width === 390 || width === 1440)
                await page.screenshot({
                    path: path.join(__dirname, `render-${width}.png`),
                    fullPage: true,
                });
            results.push(result);
        }
        await page
            .getByRole("link", { name: "このブログについて", exact: true })
            .click();
        assert.equal(
            await page.locator("#about").evaluate((dialog) => dialog.open),
            true,
        );
        await page.keyboard.press("Escape");
        assert.equal(
            await page.locator("#about").evaluate((dialog) => dialog.open),
            false,
        );
        await page.getByRole("link", { name: "タグ", exact: true }).click();
        assert.equal(
            await page.locator("#tags").evaluate((dialog) => dialog.open),
            true,
        );
        await page
            .locator("#tags")
            .getByRole("link", { name: "Obsidian", exact: true })
            .click();
        assert.equal(
            await page.locator("#tags").evaluate((dialog) => dialog.open),
            false,
        );
        assert.ok(page.url().endsWith("#note-obsidian"));
        console.log(JSON.stringify(results, null, 2));
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
