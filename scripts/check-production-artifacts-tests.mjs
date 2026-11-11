import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    unlink,
    writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/production-artifacts-"));
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
await mkdir(join(fixture, "src/content/posts"), { recursive: true });
const production = join(fixture, "dist");

function run(script, args, cwd = root) {
    const result = spawnSync(process.execPath, [script, ...args], {
        cwd,
        env: { ...process.env, BLOG_BUILD_TARGET: "production" },
        encoding: "utf8",
        timeout: 120000,
    });
    assert.ifError(result.error);
    return { status: result.status, log: result.stdout + result.stderr };
}

function build() {
    const result = run(
        join(root, "node_modules/astro/bin/astro.mjs"),
        ["build"],
        fixture,
    );
    assert.equal(result.status, 0, result.log);
}

async function digest() {
    const files = (
        await readdir(production, { recursive: true, withFileTypes: true })
    )
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
    const hash = createHash("sha256");
    for (const file of files)
        hash.update(relative(production, file)).update(await readFile(file));
    return hash.digest("hex");
}

async function inspect() {
    const before = await digest();
    const result = run(join(root, "scripts/check-production-artifacts.mjs"), [
        production,
        fixture,
    ]);
    assert.equal(
        await digest(),
        before,
        "検査コマンドは本番成果物を変更しません",
    );
    return result;
}

build();
const empty = await inspect();
assert.equal(empty.status, 0, empty.log);
console.log(
    "本番成果物の独立検証: 正式記事0件の成果物が成功し、成果物は変わりません。",
);

const rss = await readFile(join(production, "rss.xml"));
await unlink(join(production, "rss.xml"));
try {
    const missing = await inspect();
    assert.notEqual(missing.status, 0, "必須のrss.xmlがない成果物は失敗します");
    assert.match(missing.log, /rss\.xml/i, missing.log);
} finally {
    await writeFile(join(production, "rss.xml"), rss);
}
console.log(
    "本番成果物の独立検証: RSS欠落を検出し、失敗時にも成果物は変わりません。",
);

const shared =
    "公開記事と下書きに共通する長い段落も正しく公開できることを確認します。";
const publicBody =
    "正式記事だけに掲載する独立検証用の本文です。生成済みの成果物をそのまま検査します。";
const privateBody =
    "下書きの専用本文は公開成果物のどのテキストにも残してはいけません。独立検証で確認します。";
const sampleBody =
    "サンプル記事の専用本文は本番に混入してはいけません。独立した検証専用の文章です。";

async function add(path, content) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), content);
}

await add(
    "src/content/posts/published/entry.mdx",
    `---\ntitle: 共通する記事タイトル\ndescription: 公開する説明文です。\ndate: "2026-09-01"\ntags: [astro]\ndraft: false\n---\n\n${publicBody}\n\n${shared}\n`,
);
await add(
    "src/content/posts/private/entry.mdx",
    `---\ntitle: 共通する記事タイトル\ndraft: true\n---\n\n${privateBody}\n\n${shared}\n`,
);
await add(
    "tests/fixtures/content/posts/independent-sample.mdx",
    `---\ntitle: 独立検証用サンプル\ndate: "2026-09-01"\ndraft: false\n---\n\n${sampleBody}\n`,
);
build();
const published = await inspect();
assert.equal(published.status, 0, published.log);
console.log(
    "本番成果物の独立検証: 公開記事がある正常な成果物が成功し、共通語句や同名タイトルを誤検知しません。",
);

const publishedRss = await readFile(join(production, "rss.xml"), "utf8");
await writeFile(
    join(production, "rss.xml"),
    publishedRss.replace(
        "<title>共通する記事タイトル</title>",
        "<title>公開記事と一致しないタイトル</title>",
    ),
);
try {
    const wrong = await inspect();
    assert.notEqual(
        wrong.status,
        0,
        "RSS項目が公開記事と一致しない成果物は失敗します",
    );
    assert.match(wrong.log, /rss/i, wrong.log);
} finally {
    await writeFile(join(production, "rss.xml"), publishedRss);
}
console.log("本番成果物の独立検証: RSSの項目と公開記事の不整合を検出します。");

const homepage = await readFile(join(production, "index.html"), "utf8");
const missingListing = homepage.replace(
    /<article\b[^>]*>[\s\S]*?<\/article>/,
    "",
);
assert.notEqual(missingListing, homepage, "改変対象の公開記事一覧が存在します");
await writeFile(join(production, "index.html"), missingListing);
try {
    const missing = await inspect();
    assert.notEqual(
        missing.status,
        0,
        "ホーム一覧から公開記事が欠落した成果物は失敗します",
    );
    assert.match(missing.log, /index\.html/i, missing.log);
} finally {
    await writeFile(join(production, "index.html"), homepage);
}
console.log("本番成果物の独立検証: ホーム一覧の公開記事欠落を検出します。");
