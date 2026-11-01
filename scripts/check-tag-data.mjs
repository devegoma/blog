import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const output = await mkdtemp(join(root, "test-results/tag-data-"));
const definitions = join(root, "src/data/tags.ts");
const original = await readFile(definitions, "utf8");
const id = `tag-data-check-${process.pid}`;
const sources = [];
const html = (path) => readFile(join(output, path, "index.html"), "utf8");
function build(expectedErrors = [], command = "build") {
    const result = spawnSync(
        process.execPath,
        [
            join(root, "node_modules/astro/bin/astro.mjs"),
            command,
            ...(command === "build" ? ["--outDir", output] : []),
        ],
        { cwd: root, encoding: "utf8", timeout: 60000 },
    );
    assert.ifError(result.error);
    const log = result.stdout + result.stderr;
    if (expectedErrors.length) {
        assert.notEqual(result.status, 0, "Invalid tags unexpectedly passed");
        for (const error of expectedErrors) assert(log.includes(error), log);
    } else assert.equal(result.status, 0, log);
}
async function add(path, content) {
    const source = join(root, path);
    await writeFile(source, content, { flag: "wx" });
    sources.push(source);
    return source;
}
const content = (tags, draft) =>
    `---\ntitle: Tag data check\ndate: "2026-09-01"\ndraft: ${draft}\n${tags === undefined ? "" : `tags: ${JSON.stringify(tags)}\n`}---\n\nTag data check.\n`;
try {
    // Inspect the real collection, including drafts and defaults, after a build.
    await add(
        `src/pages/${id}.json.ts`,
        `import { getCollection } from "astro:content";
export async function GET() {
    return new Response(JSON.stringify((await getCollection("posts")).map(({ id, data }) => ({ id, tags: data.tags }))));
}
`,
    );
    for (const draft of [false, true]) {
        for (const [name, tags] of [
            ["multiple", ["astro", "typescript", "astro", "typescript"]],
            ["empty", []],
            ["omitted", undefined],
        ])
            await add(
                `src/content/posts/${id}-${draft}-${name}.mdx`,
                content(tags, draft),
            );
    }
    const unused = original.replace(
        "const definitions: [string, string][] = [",
        'const definitions: [string, string][] = [\n    ["unused-tag", "未使用"],',
    );
    await writeFile(definitions, unused);
    build();
    const collection = JSON.parse(
        await readFile(join(output, `${id}.json`), "utf8"),
    );
    for (const draft of [false, true])
        for (const name of ["multiple", "empty", "omitted"])
            assert.deepEqual(
                collection.find((post) => post.id === `${id}-${draft}-${name}`)
                    ?.tags,
                name === "multiple" ? ["astro", "typescript"] : [],
            );
    const articlePath = `posts/${id}-false-multiple`;
    const before = await html(articlePath);
    assert(before.includes('href="/tags/typescript/"'));
    assert((await html("tags/typescript")).includes(articlePath));
    assert(!(await html("tags")).includes("unused-tag"));
    for (const tag of ["unused-tag", "draft-only"])
        await assert.rejects(html(`tags/${tag}`), { code: "ENOENT" });
    await assert.rejects(html(`posts/${id}-true-multiple`), { code: "ENOENT" });

    await writeFile(
        definitions,
        unused.replace('"TypeScript"', '"日本語 C++"'),
    );
    build();
    for (const path of [
        articlePath,
        "posts/automation",
        "tags/typescript",
        "tags",
    ])
        assert((await html(path)).includes("日本語 C++"), path);
    assert((await html(articlePath)).includes('href="/tags/typescript/"'));

    await writeFile(definitions, original);
    for (const draft of [false, true]) {
        const source = join(
            root,
            `src/content/posts/${id}-${draft}-multiple.mdx`,
        );
        await writeFile(
            source,
            content(["astro", "unknown-tag", "unknown-tag"], draft),
        );
        build([`${id}-${draft}-multiple.mdx`, "未定義のタグです: unknown-tag"]);
        await writeFile(
            source,
            content(["astro", "typescript", "astro"], draft),
        );
    }
    for (const invalid of [
        "",
        "Upper",
        "日本語",
        "C++",
        "white space",
        "under_score",
        "-start",
        "end-",
        "double--dash",
        "slash/name",
    ]) {
        await writeFile(
            definitions,
            original.replace(
                '["astro", "Astro"]',
                `[${JSON.stringify(invalid)}, "Astro"]`,
            ),
        );
        build([
            "src/data/tags.ts",
            "固定名の形式が不正です",
            JSON.stringify(invalid),
        ]);
    }
    await writeFile(
        definitions,
        original.replace(
            '["astro", "Astro"]',
            '["typescript", "Must not overwrite"]',
        ),
    );
    build(["src/data/tags.ts", "固定名が重複しています", '"typescript"']);
    build(
        ["src/data/tags.ts", "固定名が重複しています", '"typescript"'],
        "check",
    );
    console.log(
        "Tag data checks passed: defaults, ordered deduplication for published/draft posts, Japanese/C++ rename with stable URLs, publication wiring, undefined references, invalid/duplicate definitions block builds.",
    );
} finally {
    await writeFile(definitions, original);
    await Promise.all(sources.map((source) => unlink(source)));
}
