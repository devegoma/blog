import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import base from "../../playwright.config.ts";
export default defineConfig({
    ...base,
    testDir: "../../tests",
    outputDir: "../../test-results",
    use: { ...base.use, baseURL: "http://127.0.0.1:4376" },
    webServer: {
        command: "pnpm preview --host 127.0.0.1 --port 4376",
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        url: "http://127.0.0.1:4376",
        reuseExistingServer: false,
    },
});
