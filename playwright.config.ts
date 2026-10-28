import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: "list",
    use: {
        baseURL: "http://127.0.0.1:4321",
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: (["chromium", "firefox"] as const).flatMap((browserName) =>
        [
            { width: 1280, height: 720 },
            { width: 1920, height: 1080 },
            { width: 390, height: 844 },
        ].map((viewport) => ({
            name: `${browserName}-${viewport.width}x${viewport.height}`,
            use: { browserName, viewport },
        })),
    ),
    webServer: {
        command: "pnpm preview --host 127.0.0.1 --port 4321",
        url: "http://127.0.0.1:4321",
        reuseExistingServer: false,
    },
});
