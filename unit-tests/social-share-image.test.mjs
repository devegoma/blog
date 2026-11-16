import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "@playwright/test";

test("the shared public image is a readable 1200×630 PNG", async () => {
    const png = await readFile(
        new URL("../public/images/social-share.png", import.meta.url),
    );
    assert.deepEqual(
        [...png.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
    );
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const dimensions = await page.evaluate(async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            return [image.naturalWidth, image.naturalHeight];
        }, png.toString("base64"));
        assert.deepEqual(dimensions, [1200, 630]);
    } finally {
        await browser.close();
    }
});
