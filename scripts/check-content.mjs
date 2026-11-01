import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    rename,
    unlink,
    writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Keep fixtures out of the author's content and Astro cache.
const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/content-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
const posts = join(fixture, "src/content/posts");
await mkdir(posts, { recursive: true });
await writeFile(
    join(fixture, "src/pages/content-check.json.ts"),
    `import { getCollection } from "astro:content";
import { getPosts } from "../data/posts";
export async function GET() {
    const entries = (await getCollection("posts")).map((entry) => ({
        ...entry.data, id: entry.id, href: "/posts/" + entry.id + "/", entry,
    }));
    const published = await getPosts({ includeDrafts: true });
    return new Response(JSON.stringify({ entries, published }));
}
`,
);
const body = "CONTENT_DATA_RAW_BODY";
const content = (fields) => `---\n${fields}\n---\n\n${body}\n`;
const published = 'title: Minimal published\ndate: "2026-09-01"\ndraft: false';
async function add(path, fields) {
    const file = join(posts, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content(fields));
}
function build(errors = []) {
    const result = spawnSync(
        process.execPath,
        [join(root, "node_modules/astro/bin/astro.mjs"), "build"],
        { cwd: fixture, encoding: "utf8", timeout: 60000 },
    );
    const log = result.stdout + result.stderr;
    assert.equal(result.error, undefined, log);
    if (errors.length) {
        assert.notEqual(result.status, 0, log);
        for (const error of errors) assert(log.includes(error), log);
    } else assert.equal(result.status, 0, log);
}
const html = (path) =>
    readFile(join(fixture, "dist", path, "index.html"), "utf8");
const snapshot = async () =>
    JSON.parse(
        await readFile(join(fixture, "dist/content-check.json"), "utf8"),
    );
for (const path of [
    "automation.mdx",
    "astro/routing.mdx",
    "tools/routing.mdx",
    "astro/index.mdx",
    "astro/deep/entry.mdx",
])
    await add(path, published);
await add("draft.mdx", "title: Minimal draft");
await add("explicit-draft.mdx", "title: Explicit draft\ndraft: true");
await add("ignored.md", "title: Ignored Markdown\nslug: ignored");
await add(
    "optional.mdx",
    `${published}\nupdated: "2026-09-02"\ndescription: Explicit description\ntags: [astro]\nminutes: 2\nimage: /images/example.png`,
);
build();
const { entries, published: publicEntries } = await snapshot();
assert.equal(entries.length, 8);
assert.equal(publicEntries.length, 6);
assert(publicEntries.every((post) => post.draft === false));
assert(
    !publicEntries.some((post) =>
        ["draft", "explicit-draft"].includes(post.id),
    ),
);
for (const post of entries) {
    assert.equal(post.href, `/posts/${post.id}/`);
    assert.equal(post.entry.id, post.id);
    assert(
        post.entry.filePath
            .replaceAll("\\", "/")
            .endsWith(`src/content/posts/${post.id}.mdx`),
    );
    assert(post.entry.body.includes(body));
    if (post.draft) {
        assert.deepEqual(post.entry.data, {
            title: post.title,
            tags: [],
            draft: true,
        });
        await assert.rejects(html(`posts/${post.id}`), { code: "ENOENT" });
    } else {
        assert((await html(`posts/${post.id}`)).includes(body));
        assert((await html("")).includes(`href="${post.href}"`));
    }
}
const minimal = publicEntries.find((post) => post.id === "automation");
assert.deepEqual(minimal.entry.data, {
    title: "Minimal published",
    date: "2026-09-01",
    tags: [],
    draft: false,
});
assert.equal(minimal.entry.data.description, undefined);
assert.equal(minimal.description, minimal.title); // Display fallback, not #27's excerpt.
const optional = publicEntries.find((post) => post.id === "optional");
assert.equal(optional.description, "Explicit description");
assert.deepEqual(optional.tags, ["astro"]);
assert.equal(optional.minutes, 2);
assert.equal(optional.image, "/images/example.png");
assert.equal(optional.updated, "2026-09-02");
await add(
    "astro/routing.mdx",
    published.replace("Minimal published", "Renamed title"),
);
build();
assert((await html("posts/astro/routing")).includes("Renamed title"));
assert.equal(
    (await snapshot()).entries.find((post) => post.title === "Renamed title")
        .href,
    "/posts/astro/routing/",
);

// One build reports every invalid field on the same source file.
await add(
    "invalid.mdx",
    'title: "  "\ndate: 123\nupdated: false\ntags: astro\ndescription: 123\ndraft: "false"\nminutes: 0\nimage: /other/example.png',
);
build([
    "invalid.mdx",
    "title",
    "date",
    "updated",
    "tags",
    "description",
    "draft",
    "minutes",
    "image",
]);
await add("invalid.mdx", "title: 123");
build(["invalid.mdx", "title", "string"]);
await add("invalid.mdx", "title: Invalid\ntags: [123]\nminutes: 1.5");
build(["invalid.mdx", "tags", "minutes"]);
await add("invalid.mdx", "title: Invalid\nslug: null");
build(["invalid.mdx", "slug は指定できません"]);
await unlink(join(posts, "invalid.mdx"));

for (const name of [
    "Upper",
    "日本語",
    "has space",
    "under_score",
    "-leading",
    "trailing-",
    "two--hyphens",
]) {
    await add(`${name}.mdx`, published);
    build([`src/content/posts/${name}.mdx`, "記事の配置が不正"]);
    await mkdir(join(posts, name));
    await rename(join(posts, `${name}.mdx`), join(posts, name, "entry.mdx"));
    build([`src/content/posts/${name}/entry.mdx`, "記事の配置が不正"]);
    await unlink(join(posts, name, "entry.mdx"));
}
console.log(
    "Content checks passed: minimal public/draft data, defaults, raw source/body, nested/index URLs and links, stable titles, optional fields, ignored Markdown, invalid names/types/slug.",
);
