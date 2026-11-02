import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("通常ページの共有画像をHTTPで取得すると公開用PNGと一致する", async ({
    page,
    request,
}) => {
    const directory = resolve("dist");
    const expected = await readFile("public/images/social-share.png");
    const imageUrl = "https://blog.devegoma.com/images/social-share.png";
    const imagePaths = new Set<string>();
    let pages = 0;
    // Parse the HTTP HTML without loading page resources or contacting production.
    await page.route("**/*", (route) => route.abort());
    for (const entry of await readdir(directory, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (!entry.isFile() || entry.name !== "index.html") continue;
        const file = join(entry.parentPath, entry.name);
        const path =
            "/" + relative(directory, file).replaceAll("\\", "/").slice(0, -10);
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(200);
        expect(response.headers()["content-type"], path).toMatch(/text\/html/);
        await page.setContent(await response.text());
        for (const selector of [
            'head meta[property="og:image"]',
            'head meta[name="twitter:image"]',
        ]) {
            const references = await page
                .locator(selector)
                .evaluateAll((nodes) =>
                    nodes.map((node) => node.getAttribute("content")),
                );
            expect(references, `${path}: ${selector}`).toEqual([imageUrl]);
            // Map the advertised production URL onto the local preview server.
            imagePaths.add(new URL(references[0]!).pathname);
        }
        pages++;
    }
    expect(pages).toBeGreaterThan(0);
    for (const path of imagePaths) {
        const response = await request.get(path, { maxRedirects: 0 });
        expect(response.status(), path).toBe(200);
        expect(response.headers()["content-type"], path).toMatch(
            /^image\/png(?:;|$)/,
        );
        expect(await response.body(), path).toEqual(expected);
    }
});
