import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
const server = spawn(
    process.execPath,
    [
        "node_modules/astro/bin/astro.mjs",
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        "4328",
    ],
    { stdio: "ignore" },
);
let browser;
try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
        try {
            if ((await fetch("http://127.0.0.1:4328/tags/")).ok) {
                ready = true;
                break;
            }
        } catch {}
        await setTimeout(100);
    }
    if (!ready) throw Error("Preview did not start");
    browser = await chromium.launch();
    const checks = [];
    for (const width of [320, 390, 1280, 1440])
        for (const theme of ["light", "dark"]) {
            const context = await browser.newContext({
                viewport: { width, height: 900 },
                colorScheme: theme,
            });
            const page = await context.newPage();
            for (const [name, path] of [
                ["tags", "/tags/"],
                ["selected", "/tags/typescript/"],
            ]) {
                await page.goto("http://127.0.0.1:4328" + path);
                await page.evaluate(() => document.fonts.ready);
                if (
                    !(await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <= innerWidth,
                    ))
                )
                    throw Error(`Overflow ${width} ${name}`);
                await page.screenshot({
                    path: `output/tag-pages-implementation/${width}-${theme}-${name}.png`,
                    fullPage: true,
                });
                const chooserWidth = (
                    await page.locator(".tag-chooser").boundingBox()
                ).width;
                const before = checks.find(
                    (check) => check.width === width && check.theme === theme,
                );
                if (
                    before &&
                    Math.abs(before.chooserWidth - chooserWidth) > 0.5
                )
                    throw Error(`Tag width changed ${width} ${theme}`);
                if (width >= 1200 && chooserWidth !== 240)
                    throw Error(`Unexpected PC tag width ${chooserWidth}`);
                checks.push({
                    width,
                    theme,
                    path,
                    chooserWidth,
                    overflow: false,
                });
            }
            await context.close();
        }
    await writeFile(
        "output/tag-pages-implementation/checks.json",
        JSON.stringify(checks, null, 2),
    );
    console.log(
        "16 implementation screenshots captured; no horizontal overflow.",
    );
} finally {
    await browser?.close();
    server.kill();
}
