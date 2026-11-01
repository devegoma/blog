import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import {
    mkdtemp,
    mkdir,
    readFile,
    writeFile,
    unlink,
    readdir,
    rmdir,
} from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join, dirname } from "node:path";
import { setTimeout } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "node_modules/astro/bin/astro.mjs");
const folderId = `publication-check-${process.pid}`;
const id = `${folderId}/entry`;
const postsRoot = join(root, "src/content/posts");
const sourceFolder = join(postsRoot, folderId);
const source = join(sourceFolder, "entry.mdx");
const markdownId = `${folderId}/markdown`;
const markdownSource = join(sourceFolder, "markdown.md");
await mkdir(join(root, "test-results"), { recursive: true });
const output = await mkdtemp(join(root, "test-results/publication-"));
const article = join(output, "posts", id, "index.html");
const body = "PUBLICATION_LIFECYCLE_TEST_BODY";
const content = (title, draft = false) =>
    `---\ntitle: ${title}\ndescription: Publication test\ndate: "2026-09-01"\nminutes: 1\ntags: [draft-only, draft-only]\ndraft: ${draft}\n---\n\n## Check\n\n${body}\n`;
function build(expectedError, expectedFile = `${id}.mdx`) {
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
        for (const message of [expectedError, expectedFile].flat())
            assert(log.replaceAll("\\", "/").includes(message), log);
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

await mkdir(sourceFolder);
try {
    await writeFile(source, content("Original title"), { flag: "wx" });
    await writeFile(markdownSource, content("Unsupported Markdown"), {
        flag: "wx",
    });
    build();
    await assert.rejects(
        readFile(join(output, "posts", markdownId, "index.html")),
        { code: "ENOENT" },
    );
    assert(
        !(await readFile(join(output, "index.html"), "utf8")).includes(
            "Unsupported Markdown",
        ),
    );
    assert((await readFile(article, "utf8")).includes("Original title"));
    assert(
        (await readFile(join(output, "index.html"), "utf8")).includes(
            `href="/posts/${id}/"`,
        ),
    );
    assert(
        (
            await readFile(join(output, "tags/draft-only/index.html"), "utf8")
        ).includes(`href="/posts/${id}/"`),
    );
    const pathFixtures = [
        [`${folderId}.mdx`, folderId],
        [`${folderId}-entry.mdx`, `${folderId}-entry`],
        [`${folderId}/index.mdx`, `${folderId}/index`],
        [`${folderId}/second/entry.mdx`, `${folderId}/second/entry`],
    ];
    await mkdir(join(sourceFolder, "second"));
    try {
        for (const [path] of pathFixtures)
            await writeFile(join(postsRoot, path), content("Path fixture"), {
                flag: "wx",
            });
        build();
        const expectedOrder = [
            folderId,
            `${folderId}-entry`,
            id,
            `${folderId}/index`,
            `${folderId}/second/entry`,
        ];
        for (const page of ["index.html", "tags/draft-only/index.html"]) {
            const html = await readFile(join(output, page), "utf8");
            const actual = [
                ...html.matchAll(/<h2>\s*<a href="\/posts\/([^" ]+)\/"/g),
            ]
                .map((match) => match[1])
                .filter((route) => expectedOrder.includes(route));
            assert.deepEqual(actual, expectedOrder, page);
        }
        for (const [, route] of pathFixtures)
            assert(
                (
                    await readFile(
                        join(output, "posts", route, "index.html"),
                        "utf8",
                    )
                ).includes("Path fixture"),
            );
    } finally {
        for (const [path] of pathFixtures) await unlink(join(postsRoot, path));
        await rmdir(join(sourceFolder, "second"));
    }
    assert.equal(
        (
            (await readFile(article, "utf8")).match(
                /href="\/tags\/draft-only\/"/g,
            ) ?? []
        ).length,
        1,
        "Duplicate article tags must render only once",
    );
    for (const path of [
        `${folderId}-Upper/entry.mdx`,
        `${folderId}/Upper.mdx`,
        `${folderId}/bad_name.mdx`,
    ]) {
        const invalidSource = join(postsRoot, path);
        const folder = dirname(invalidSource);
        const createFolder = folder !== sourceFolder && folder !== postsRoot;
        if (createFolder) await mkdir(folder);
        try {
            await writeFile(invalidSource, content("Invalid path"), {
                flag: "wx",
            });
            build(`記事の配置が不正です: src/content/posts/${path}`, path);
        } finally {
            await unlink(invalidSource);
            if (createFolder) await rmdir(folder);
        }
    }
    for (const [invalid, message] of [
        [content("Invalid").replace("title: Invalid\n", ""), "title"],
        [content("Invalid").replace("title: Invalid", 'title: "   "'), "title"],
        [
            '---\ntitle: 123\ndescription: 123\ndate: 123\nupdated: 123\ntags: astro\ndraft: "false"\nminutes: "1"\nimage: 123\n---\n',
            [
                "title",
                "description",
                "date",
                "updated",
                "tags",
                "draft",
                "minutes",
                "image",
            ],
        ],
        [content("Invalid").replace("2026-09-01", "2026-02-29"), "date"],
        [
            content("Invalid", true).replace(
                "minutes: 1",
                'minutes: 1\nupdated: "1900-02-29"',
            ),
            "updated",
        ],
        [
            content("Invalid").replace(
                "title: Invalid",
                "title: Invalid\nslug: sample",
            ),
            "slug は指定できません",
        ],
        [
            content("Invalid").replace('date: "2026-09-01"\n', ""),
            "公開日が必要",
        ],
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
    await unlink(markdownSource).catch((error) => {
        if (error.code !== "ENOENT") throw error;
    });
    await rmdir(sourceFolder);
}

// Bind an available local port, then start only our own development process.
await mkdir(sourceFolder);
await writeFile(
    source,
    "---\ntitle: Nested draft\n---\n\nDRAFT_PREVIEW_ONLY_CONTENT\n",
    { flag: "wx" },
);
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
            response = await fetch(`http://127.0.0.1:${port}/posts/${id}/`, {
                signal: AbortSignal.timeout(3000),
            });
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
    await unlink(source);
    await rmdir(sourceFolder);
}
console.log(
    "Publication checks passed: file-path URLs, nested and index paths, invalid names rejected, duplicate tags removed, stable URL, drafts omitted, deleted pages removed, dev preview available.",
);
