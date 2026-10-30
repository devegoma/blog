import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import {
    mkdtemp,
    mkdir,
    readFile,
    writeFile,
    unlink,
    readdir,
} from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { setTimeout } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "node_modules/astro/bin/astro.mjs");
const id = `publication-check-${process.pid}`;
const source = join(root, "src/content/posts", `${id}.mdx`);
await mkdir(join(root, "test-results"), { recursive: true });
const output = await mkdtemp(join(root, "test-results/publication-"));
const article = join(output, "posts", id, "index.html");
const body = "PUBLICATION_LIFECYCLE_TEST_BODY";
const content = (title, draft = false) =>
    `---\ntitle: ${title}\nslug: ${id}\ndescription: Publication test\ndate: "2026-09-01"\nminutes: 1\ntags: [draft-only]\ndraft: ${draft}\n---\n\n## Check\n\n${body}\n`;
function build(expectedError) {
    const result = spawnSync(
        process.execPath,
        [cli, "build", "--outDir", output],
        {
            cwd: root,
            encoding: "utf8",
            timeout: 60000,
        },
    );
    const log = result.stdout + result.stderr;
    if (expectedError) {
        assert.notEqual(result.status, 0, "Invalid article unexpectedly built");
        assert(log.includes(expectedError), log);
    } else assert.equal(result.status, 0, log);
}
async function assertOmitted() {
    await assert.rejects(readFile(article), { code: "ENOENT" });
    for (const entry of await readdir(output, {
        recursive: true,
        withFileTypes: true,
    })) {
        if (entry.isFile() && /\.(html|js|json)$/.test(entry.name)) {
            const text = await readFile(
                join(entry.parentPath, entry.name),
                "utf8",
            );
            assert(
                !text.includes(body),
                `Draft body leaked into ${entry.name}`,
            );
        }
    }
    await assert.rejects(readFile(join(output, "tags/draft-only/index.html")), {
        code: "ENOENT",
    });
    await assert.rejects(
        readFile(join(output, "archives/2026-09/index.html")),
        { code: "ENOENT" },
    );
}

await writeFile(source, content("Original title"), { flag: "wx" });
try {
    build();
    assert((await readFile(article, "utf8")).includes("Original title"));
    for (const [invalid, message] of [
        [content("Invalid").replace(`slug: ${id}\n`, ""), "URL用固定名"],
        [
            content("Invalid").replace("2026-09-01", "9999-01-01"),
            "未来の公開日",
        ],
        [
            content("Invalid").replace(
                "minutes: 1",
                'minutes: 1\nupdated: "2026-08-01"',
            ),
            "更新日は",
        ],
        [
            content("Invalid").replace("draft-only", "undefined-tag"),
            "未定義のタグ",
        ],
        [
            content("Invalid").replace(`slug: ${id}`, "slug: sample"),
            "記事URLが重複",
        ],
    ]) {
        await writeFile(source, invalid);
        build(message);
    }
    await writeFile(source, content("Renamed title"));
    build();
    assert((await readFile(article, "utf8")).includes("Renamed title"));
    await writeFile(source, content("Renamed title", true));
    build();
    await assertOmitted();
    await unlink(source);
    build();
    await assertOmitted();
} finally {
    await unlink(source).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
}

// Bind an available local port, then start only our own development process.
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const server = spawn(
    process.execPath,
    [cli, "dev", "--host", "127.0.0.1", "--port", String(port)],
    {
        cwd: root,
        stdio: "ignore",
    },
);
try {
    const deadline = Date.now() + 30000;
    let response;
    while (Date.now() < deadline) {
        try {
            response = await fetch(
                `http://127.0.0.1:${port}/posts/draft-preview/`,
                { signal: AbortSignal.timeout(3000) },
            );
            break;
        } catch {
            await setTimeout(200);
        }
    }
    assert.equal(
        response?.status,
        200,
        "Development draft preview did not start",
    );
    const html = await response.text();
    assert(html.includes("DRAFT_PREVIEW_ONLY_CONTENT"));
    assert(html.includes("開発プレビュー限定"));
} finally {
    server.kill();
}
console.log(
    "Publication checks passed: stable URL, drafts omitted, deleted pages removed, dev preview available.",
);
