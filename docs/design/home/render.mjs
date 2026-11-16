import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// デザイン資料専用。実際のサイトやモバイル画面は変更しない。
const browser = await chromium.launch();
try {
    const page = await browser.newPage({
        viewport: { width: 1444, height: 1200 },
        deviceScaleFactor: 1,
    });
    await page.goto(new URL("./preview.html", import.meta.url).href);
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ["light", "dark"]) {
        await page.locator("body").evaluate((body, theme) => {
            body.className = theme;
        }, theme);
        const boxes = await page.locator(".thumbnail").evaluateAll((elements) =>
            elements.map((element) => {
                const { width, height } = element.getBoundingClientRect();
                return { width, height };
            }),
        );
        assert.equal(boxes.length, 3);
        for (const box of boxes) {
            assert.equal(box.width, 320);
            assert.equal(box.height, 180);
            assert.equal(box.width / box.height, 16 / 9);
        }
        const overflow = await page
            .locator(".copy")
            .evaluateAll((elements) =>
                elements.some(
                    (element) => element.scrollWidth > element.clientWidth,
                ),
            );
        assert.equal(overflow, false, "記事の文字が横にはみ出していないこと");
        await page.screenshot({
            path: fileURLToPath(
                new URL(`./desktop-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
        });
        console.log(`${theme}: 3 thumbnails verified at 320×180 (16:9)`);
    }
} finally {
    await browser.close();
}
