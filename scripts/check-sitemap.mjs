import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    unlink,
    writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import sax from "sax";

// Keep the author's articles and build cache untouched.
process.env.BLOG_BUILD_TARGET = "production";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/sitemap-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
await mkdir(join(fixture, "src/content/posts"), { recursive: true });

async function writePost(path, data) {
    const file = join(fixture, "src/content/posts", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(
        file,
        `---\n${JSON.stringify(data)}\n---\n\n本文の記録。\n`,
    );
}

async function build() {
    const result = spawnSync(
        process.execPath,
        [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
        {
            cwd: fixture,
            encoding: "utf8",
            timeout: 60000,
            env: { ...process.env, SHOW_DRAFTS: "true" },
        },
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const xml = await readFile(join(fixture, "dist/sitemap.xml"), "utf8");
    const parser = sax.parser(true, { xmlns: true });
    const stack = [];
    const urls = [];
    parser.onopentag = (node) => {
        assert.equal(node.uri, "http://www.sitemaps.org/schemas/sitemap/0.9");
        const expected = ["urlset", "url", "loc"][stack.length];
        assert.equal(node.local, expected);
        stack.push({ name: node.local, text: "", children: 0 });
        if (stack.length > 1) stack.at(-2).children++;
    };
    parser.ontext = (text) => {
        if (stack.length) stack.at(-1).text += text;
    };
    parser.onclosetag = () => {
        const node = stack.pop();
        if (node.name === "loc") urls.push(node.text);
        else if (node.name === "url") assert.equal(node.children, 1);
    };
    parser.write(xml).close();
    assert.equal(new Set(urls).size, urls.length, "Duplicate sitemap URLs");
    for (const value of urls) {
        const url = new URL(value);
        assert.equal(url.origin, "https://blog.devegoma.com");
        assert.equal(url.search, "");
        assert.equal(url.hash, "");
        assert(url.pathname.endsWith("/"));
        await readFile(join(fixture, "dist", url.pathname, "index.html"));
    }
    const inspection = spawnSync(
        process.execPath,
        [
            join(root, "scripts/check-search-artifacts.mjs"),
            join(fixture, "dist"),
        ],
        { cwd: root, encoding: "utf8", timeout: 60000 },
    );
    assert.ifError(inspection.error);
    assert.equal(inspection.status, 0, inspection.stdout + inspection.stderr);
    return urls.sort();
}

const fixed = [
    "https://blog.devegoma.com/",
    "https://blog.devegoma.com/about/",
    "https://blog.devegoma.com/tags/",
];
assert.deepEqual(await build(), fixed);
assert.equal(
    await readFile(join(fixture, "dist/robots.txt"), "utf8"),
    "User-agent: *\nAllow: /\nSitemap: https://blog.devegoma.com/sitemap.xml\n",
);
await writePost("nested/published.mdx", {
    title: "公開記事",
    date: "2026-09-01",
    updated: "2026-10-01",
    tags: ["typescript", "astro", "typescript"],
    draft: false,
});
for (const draft of [true, undefined]) {
    await writePost(`draft-${String(draft)}.mdx`, {
        title: "下書き",
        date: "2099-01-01",
        tags: ["draft-only"],
        draft,
    });
}
const single = [
    ...fixed,
    "https://blog.devegoma.com/archives/2026-09/",
    "https://blog.devegoma.com/posts/nested/published/",
    "https://blog.devegoma.com/tags/astro/",
    "https://blog.devegoma.com/tags/typescript/",
].sort();
assert.deepEqual(await build(), single);
const batchUrls = [];
async function addBatch(index) {
    await writePost(`batch/entry-${index}.mdx`, {
        title: `記事${index}`,
        date: "2026-09-01",
        tags: ["typescript"],
        draft: false,
    });
    batchUrls.push(`https://blog.devegoma.com/posts/batch/entry-${index}/`);
}
for (let index = 1; index <= 9; index++) await addBatch(index);
assert.deepEqual(await build(), [...single, ...batchUrls].sort());
await addBatch(10);
const secondPage = "https://blog.devegoma.com/tags/typescript/page/2/";
const homeSecondPage = "https://blog.devegoma.com/page/2/";
assert.deepEqual(
    await build(),
    [...single, ...batchUrls, secondPage, homeSecondPage].sort(),
);
for (let index = 11; index <= 20; index++) await addBatch(index);
await writePost("untagged.mdx", {
    title: "タグなしの記事",
    date: "2026-08-01",
    draft: false,
});
assert.deepEqual(
    await build(),
    [
        ...single,
        ...batchUrls,
        secondPage,
        homeSecondPage,
        "https://blog.devegoma.com/page/3/",
        "https://blog.devegoma.com/tags/typescript/page/3/",
        "https://blog.devegoma.com/archives/2026-08/",
        "https://blog.devegoma.com/posts/untagged/",
    ].sort(),
);
await writePost("nested/published.mdx", {
    title: "下書きに戻した記事",
    date: "2026-09-01",
    tags: ["typescript", "astro"],
    draft: true,
});
await unlink(join(fixture, "src/content/posts/untagged.mdx"));
await unlink(join(fixture, "src/content/posts/batch/entry-20.mdx"));
batchUrls.pop();
assert.deepEqual(
    await build(),
    [
        ...fixed,
        ...batchUrls,
        secondPage,
        homeSecondPage,
        "https://blog.devegoma.com/archives/2026-09/",
        "https://blog.devegoma.com/tags/typescript/",
    ].sort(),
);
for (let index = 1; index <= 19; index++)
    await unlink(join(fixture, `src/content/posts/batch/entry-${index}.mdx`));
assert.deepEqual(await build(), fixed);
console.log(
    "Sitemap checks passed: XML, exact public URLs, HTML metadata, local HTTP, 0/1/10/11/21+ articles, tag pagination, untagged articles, deletion/draft changes and robots.txt.",
);
