import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
    process.execPath,
    [
        fileURLToPath(
            new URL("../node_modules/astro/bin/astro.mjs", import.meta.url),
        ),
        ...process.argv.slice(2),
    ],
    {
        stdio: "inherit",
        env: { ...process.env, BLOG_BUILD_TARGET: "verification" },
    },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
