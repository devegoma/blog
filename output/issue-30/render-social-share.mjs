import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Reuse the site's local DM Sans and wordmark styling without a running server.
const font = await readFile(
    new URL("../../public/fonts/dm-sans.ttf", import.meta.url),
);
const browser = await chromium.launch();
try {
    const page = await browser.newPage({
        viewport: { width: 1200, height: 630 },
        deviceScaleFactor: 1,
    });
    await page.setContent(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Shared blog image</title>
<style>
    @font-face {
        font-family: "DM Sans";
        src: url("data:font/ttf;base64,${font.toString("base64")}") format("truetype");
        font-weight: 100 1000;
    }
    body {
        margin: 0;
        box-sizing: border-box;
        width: 1200px;
        height: 630px;
        border: 24px solid #101c24;
        display: grid;
        place-items: center;
        background: #f3f7f8;
        color: #172c33;
    }
    .wordmark {
        font-family: "DM Sans", sans-serif;
        font-size: 112px;
        font-weight: 1000;
        letter-spacing: -0.075em;
        line-height: 1.12;
        white-space: nowrap;
    }
    .wordmark span { color: #e9ba00; }
</style>
<body><div class="wordmark">devegoma<span>’</span>s blog</div></body>
</html>`);
    await page.evaluate(() => document.fonts.load('1000 112px "DM Sans"'));
    await page.screenshot({
        path: fileURLToPath(
            new URL("../../public/images/social-share.png", import.meta.url),
        ),
    });
} finally {
    await browser.close();
}
