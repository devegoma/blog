import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
try {
    const page = await browser.newPage({
        viewport: { width: 438, height: 1000 },
        deviceScaleFactor: 2,
    });
    await page.goto(new URL("./mobile-preview.html", import.meta.url).href);
    await page.evaluate(() => document.fonts.ready);
    for (const theme of ["light", "dark"]) {
        const toggle = page.locator(".theme-toggle");
        const dark = await page
            .locator("body")
            .evaluate((body) => body.classList.contains("dark"));
        if (dark !== (theme === "dark")) await toggle.click();
        assert.equal(
            await toggle.getAttribute("aria-label"),
            `${theme === "dark" ? "ライト" : "ダーク"}モードに切り替える`,
        );
        for (const width of [320, 390, 438]) {
            await page.setViewportSize({ width, height: 1000 });
            const layout = await page.evaluate(() => {
                const profile = document
                    .querySelector(".profile")
                    .getBoundingClientRect();
                const toggle = document
                    .querySelector(".theme-toggle")
                    .getBoundingClientRect();
                return {
                    overflow: document.documentElement.scrollWidth > innerWidth,
                    profileBottom: profile.bottom,
                    toggleTop: toggle.top,
                    toggleWidth: toggle.width,
                    toggleHeight: toggle.height,
                };
            });
            assert.equal(
                layout.overflow,
                false,
                `${theme} ${width}px: 横スクロールなし`,
            );
            assert.ok(
                layout.toggleTop > layout.profileBottom,
                "ボタンはプロフィールの下",
            );
            assert.ok(layout.toggleWidth >= 44 && layout.toggleHeight >= 44);
        }
        await page.screenshot({
            path: fileURLToPath(
                new URL(`./reference-mobile-${theme}.png`, import.meta.url),
            ),
            fullPage: true,
        });
        console.log(
            `${theme}: 320/390/438px、プロフィール下の44pxボタンを確認`,
        );
    }
} finally {
    await browser.close();
}
