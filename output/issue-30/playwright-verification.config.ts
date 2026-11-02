import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import config from "../../playwright.config";

export default defineConfig({
    ...config,
    testDir: resolve(import.meta.dirname, "../../tests"),
    webServer: {
        command: "pnpm preview --host 127.0.0.1 --port 4321 --ignore-lock",
        url: "http://127.0.0.1:4321",
        reuseExistingServer: false,
    },
});
