import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    unlink,
    writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { getBuildTarget } from "../src/config/build-target.mjs";

const originalTarget = process.env.BLOG_BUILD_TARGET;
try {
    delete process.env.BLOG_BUILD_TARGET;
    assert.equal(getBuildTarget().verification, false);
    assert.equal(getBuildTarget("production").verification, false);
    assert.equal(getBuildTarget("verification").verification, true);
    for (const value of ["", "invalid"])
        assert.throws(() => getBuildTarget(value));
} finally {
    if (originalTarget === undefined) delete process.env.BLOG_BUILD_TARGET;
    else process.env.BLOG_BUILD_TARGET = originalTarget;
}

const root = resolve(import.meta.dirname, "..");
const cli = join(root, "node_modules/astro/bin/astro.mjs");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/build-targets-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const directory of ["public", "tests/fixtures"])
    await cp(join(root, directory), join(fixture, directory), {
        recursive: true,
    });
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));

const posts = join(fixture, "src/content/posts");
const production = join(fixture, "dist");
const verification = join(fixture, "dist-verification");
const draftMarker = "BUILD_TARGET_PRIVATE_BODY";
const publishedMarker = "BUILD_TARGET_PUBLIC_BODY";
const sampleMarker = "BUILD_TARGET_FIXTURE_BODY";
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMQq9ojVrWHAUIBACHGBTEwwIz9AAAAAElFTkSuQmCC",
    "base64",
);
await mkdir(posts, { recursive: true });
await add(
    "tests/fixtures/content/posts/build-target-fixture.mdx",
    `---\ntitle: Verification fixture\ndate: "2026-09-01"\ndraft: false\nimage: /images/fixture-only.png\n---\n\n${sampleMarker}\n`,
);
await add("tests/fixtures/public/images/fixture-only.png", png);

function build(target) {
    const result = spawnSync(process.execPath, [cli, "build"], {
        cwd: fixture,
        env: { ...process.env, BLOG_BUILD_TARGET: target, SHOW_DRAFTS: "true" },
        encoding: "utf8",
        timeout: 60000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
}
async function add(path, content) {
    const file = join(fixture, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
}
async function files(directory) {
    const entries = await readdir(directory, {
        recursive: true,
        withFileTypes: true,
    });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
}
async function assertAbsent(directory, markers) {
    for (const file of await files(directory)) {
        const bytes = await readFile(file);
        const path = relative(directory, file).replaceAll("\\", "/");
        for (const marker of markers) {
            assert(
                !path.includes(marker),
                `Excluded path in ${path}: ${marker}`,
            );
            assert(
                !bytes.includes(Buffer.from(marker)),
                `Excluded content in ${path}: ${marker}`,
            );
        }
    }
}
async function digest(directory) {
    const hash = createHash("sha256");
    for (const file of await files(directory))
        hash.update(relative(directory, file)).update(await readFile(file));
    return hash.digest("hex");
}
const html = (path) => readFile(join(production, path, "index.html"), "utf8");
const excludedSamples = [
    sampleMarker,
    "fixture-only",
    "/posts/sample/",
    "/posts/automation/",
    "/posts/before-coding/",
    "/posts/draft-preview/",
    "sample-reading",
    "sample-tools",
    "sample-planning",
];
const excludedDrafts = [
    draftMarker,
    "/posts/private/entry/",
    "/posts/omitted/entry/",
    "private-cover",
    "private-body",
    "omitted-cover",
];

build("production");
for (const file of [
    "index.html",
    "about/index.html",
    "tags/index.html",
    "404.html",
    "rss.xml",
    "sitemap.xml",
    "robots.txt",
    "images/profile.png",
])
    await readFile(join(production, file));
assert((await html("")).includes("公開記事はまだありません。"));
assert(
    !(await readFile(join(production, "rss.xml"), "utf8")).includes("<item>"),
);
await assertAbsent(production, [...excludedSamples, ...excludedDrafts]);

const article = (draft) =>
    `---\ntitle: Public target article\ndescription: Public target description\ndate: "2026-09-01"\ntags: [astro]\ndraft: ${draft}\nimage: ./published-cover.png\n---\n\n${publishedMarker}\n\n![Published body](./published-body.png)\n`;
await add("src/content/posts/published/entry.mdx", article(false));
for (const name of ["published-cover", "published-body"])
    await add(`src/content/posts/published/${name}.png`, png);
await add(
    "src/content/posts/private/entry.mdx",
    `---\ntitle: Private target article\ndraft: true\nimage: ./private-cover.png\n---\n\n${draftMarker}\n\n![Private body](./private-body.png)\n`,
);
for (const name of ["private-cover", "private-body"])
    await add(
        `src/content/posts/private/${name}.png`,
        Buffer.concat([png, Buffer.from(name)]),
    );
await add(
    "src/content/posts/omitted/entry.mdx",
    `---\ntitle: Omitted draft target article\nimage: ./omitted-cover.png\n---\n\n${draftMarker}\n`,
);
await add(
    "src/content/posts/omitted/omitted-cover.png",
    Buffer.concat([png, Buffer.from("omitted-cover")]),
);
await add(
    "src/content/posts/published/unreferenced.png",
    Buffer.concat([png, Buffer.from("unreferenced-image")]),
);
build("production");
assert((await html("posts/published/entry")).includes(publishedMarker));
assert((await html("")).includes('href="/posts/published/entry/"'));
assert(
    (await readFile(join(production, "rss.xml"), "utf8")).includes(
        "/posts/published/entry/",
    ),
);
assert(
    (await readFile(join(production, "sitemap.xml"), "utf8")).includes(
        "/posts/published/entry/",
    ),
);
await assertAbsent(production, [
    ...excludedSamples,
    ...excludedDrafts,
    "unreferenced",
]);
const thumbnail = imageSource(await html(""), 'class="thumbnail"');
assert(
    thumbnail?.startsWith("/_astro/"),
    `Missing article thumbnail: ${thumbnail}`,
);
const bodyImage = imageSource(
    await html("posts/published/entry"),
    'alt="Published body"',
);
assert(
    bodyImage?.startsWith("/_astro/"),
    `Missing article body image: ${bodyImage}`,
);
await assertImageResponses([thumbnail, bodyImage]);

const productionDigest = await digest(production);
build("verification");
assert(
    (
        await readFile(
            join(verification, "posts/build-target-fixture/index.html"),
            "utf8",
        )
    ).includes(sampleMarker),
);
assert.deepEqual(
    await readFile(join(verification, "images/fixture-only.png")),
    png,
);
await assertAbsent(verification, [
    publishedMarker,
    draftMarker,
    "/posts/published/entry/",
    "published-cover",
    "published-body",
    ...excludedDrafts,
]);
assert.equal(
    await digest(production),
    productionDigest,
    "Verification build changed production artifacts",
);
const verificationDigest = await digest(verification);
build("production");
await assertAbsent(production, [...excludedSamples, ...excludedDrafts]);
assert.equal(
    await digest(verification),
    verificationDigest,
    "Production build changed verification artifacts",
);

await add("src/content/posts/published/entry.mdx", article(true));
build("production");
await assertAbsent(production, [
    ...excludedSamples,
    ...excludedDrafts,
    publishedMarker,
    "/posts/published/entry/",
    "published-cover",
    "published-body",
]);
assert((await html("")).includes("公開記事はまだありません。"));
await add("src/content/posts/published/entry.mdx", article(false));
build("production");
await unlink(join(posts, "published/entry.mdx"));
build("production");
await assertAbsent(production, [
    ...excludedSamples,
    ...excludedDrafts,
    publishedMarker,
    "/posts/published/entry/",
    "published-cover",
    "published-body",
]);
assert.equal(
    await digest(verification),
    verificationDigest,
    "Lifecycle builds changed verification artifacts",
);
console.log(
    "Build target checks passed: zero posts, published/draft separation, thumbnail/body images, fixture exclusion, alternating builds, unpublish/delete cleanup, independent outputs.",
);

function imageSource(markup, attribute) {
    const tag = [...markup.matchAll(/<img\b[^>]*>/g)].find(([tag]) =>
        tag.includes(attribute),
    )?.[0];
    return tag && /\bsrc="([^"]+)"/.exec(tag)?.[1];
}

async function assertImageResponses(paths) {
    const listener = createServer();
    await new Promise((done) => listener.listen(0, "127.0.0.1", done));
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(
        process.execPath,
        [
            cli,
            "preview",
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
            "--ignore-lock",
        ],
        {
            cwd: fixture,
            env: { ...process.env, BLOG_BUILD_TARGET: "production" },
            stdio: "ignore",
        },
    );
    try {
        let ready = false;
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline && !ready) {
            try {
                ready =
                    (await fetch(base, { signal: AbortSignal.timeout(3000) }))
                        .status === 200;
            } catch {
                /* Wait for our own preview process. */
            }
            if (!ready) await setTimeout(200);
        }
        assert(ready, "Production preview did not become ready");
        for (const path of paths) {
            const response = await fetch(base + path);
            assert.equal(response.status, 200, path);
            assert(
                response.headers.get("content-type")?.startsWith("image/"),
                path,
            );
        }
    } finally {
        if (server.exitCode === null) {
            const exited = once(server, "exit");
            server.kill();
            await exited;
        }
    }
}
