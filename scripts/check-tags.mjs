import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const output = await mkdtemp(join(root, "test-results/tags-"));
const sources = [];
const id = `tag-check-${process.pid}`;
const html = (path) => readFile(join(output, path, "index.html"), "utf8");
function build() {
    const result = spawnSync(
        process.execPath,
        [
            join(root, "node_modules/astro/bin/astro.mjs"),
            "build",
            "--outDir",
            output,
        ],
        { cwd: root, encoding: "utf8", timeout: 60000 },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
}
async function add(index) {
    const slug = `${id}-${String(index).padStart(2, "0")}`;
    const path = join(root, "src/content/posts", `${slug}.mdx`);
    sources.push(path);
    await writeFile(
        path,
        `---\ntitle: ${slug}\ndescription: Pagination verification\ndate: "2026-09-01"\ntags: [typescript, astro, typescript]\ndraft: false\n---\n\nPagination check.\n`,
        { flag: "wx" },
    );
    return slug;
}
try {
    for (let i = 0; i < 9; i++) await add(i);
    build();
    let first = await html("tags/typescript");
    assert.equal((first.match(/<article /g) ?? []).length, 10);
    assert(!first.includes('aria-label="ページ送り"'));
    await assert.rejects(html("tags/typescript/page/2"), { code: "ENOENT" });
    const last = await add(9);
    build();
    first = await html("tags/typescript");
    const second = await html("tags/typescript/page/2");
    assert.equal((first.match(/<article /g) ?? []).length, 10);
    assert.equal((second.match(/<article /g) ?? []).length, 1);
    assert(first.includes('href="/tags/typescript/page/2/" rel="next"'));
    assert(second.includes('href="/tags/typescript/" rel="prev"'));
    assert(second.includes(`href="/posts/${last}/"`));
    assert(!first.includes(`href="/posts/${last}/"`));
    for (let i = 0; i < 8; i++)
        assert(
            first.indexOf(`href="/posts/${id}-0${i}/"`) <
                first.indexOf(`href="/posts/${id}-0${i + 1}/"`),
        );
    assert.equal(
        ((await html("tags/astro")).match(/<article /g) ?? []).length,
        10,
    );
    assert.equal(
        ((await html("tags/astro/page/2")).match(/<article /g) ?? []).length,
        1,
    );
    assert((await html("tags")).includes("11件"));
    await assert.rejects(html("tags/draft-only"), { code: "ENOENT" });
    await assert.rejects(html("tags/typescript/page/3"), { code: "ENOENT" });
    console.log(
        "Tag checks passed: 10/11 posts, stable ties, multiple tags, pagination URLs, draft exclusion.",
    );
} finally {
    await Promise.all(
        sources.map(async (path) => {
            await unlink(path);
        }),
    );
}
