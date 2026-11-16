import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
    testDir: fileURLToPath(new URL("../../tests/", import.meta.url)),
    testMatch: ["about.spec.ts", "home.spec.ts"],
    outputDir: fileURLToPath(new URL("test-results/", import.meta.url)),
    reporter: "list",
    workers: 2,
    retries: 0,
    use: { baseURL: "http://127.0.0.1:4414", screenshot: "only-on-failure" },
    projects: ["chromium", "firefox"].flatMap((browserName) =>
        [1280, 1920, 390].map((width) => ({
            name: `${browserName}-${width}`,
            use: {
                browserName,
                viewport: { width, height: width === 390 ? 844 : 900 },
            },
        })),
    ),
    webServer: {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        command:
            "node node_modules/astro/bin/astro.mjs preview --outDir output/profile-implementation/build --host 127.0.0.1 --port 4414",
        url: "http://127.0.0.1:4414",
        reuseExistingServer: false,
    },
});
