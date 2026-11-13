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
const started = performance.now();
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

async function digest(directory = production) {
    const files = (
        await readdir(directory, { recursive: true, withFileTypes: true })
    )
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
    const hash = createHash("sha256");
    for (const file of files)
        hash.update(relative(directory, file)).update(await readFile(file));
    return hash.digest("hex");
}

async function inspect() {
    const before = await digest();
    const inputDirectories = ["src", "public", "tests/fixtures"];
    const inputsBefore = await Promise.all(
        inputDirectories.map((directory) => digest(join(fixture, directory))),
    );
    const result = run(join(root, "scripts/check-production-artifacts.mjs"), [
        production,
        fixture,
    ]);
    assert.equal(
        await digest(),
        before,
        "検査コマンドは本番成果物を変更しません",
    );
    assert.deepEqual(
        await Promise.all(
            inputDirectories.map((directory) =>
                digest(join(fixture, directory)),
            ),
        ),
        inputsBefore,
        "検査コマンドは正式記事・サンプル・共通素材の入力を変更しません",
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
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMQq9ojVrWHAUIBACHGBTEwwIz9AAAAAElFTkSuQmCC",
    "base64",
);

async function add(path, content) {
    await mkdir(dirname(join(fixture, path)), { recursive: true });
    await writeFile(join(fixture, path), content);
}

await add(
    "src/content/posts/published/entry.mdx",
    `---\ntitle: 共通する記事タイトル\ndescription: 公開する説明文です。\ndate: "2026-09-01"\ntags: [astro]\ndraft: false\nimage: ./shared.png\n---\n\n${publicBody}\n\n${shared}\n\n![公開本文の画像](./body.png)\n\n![空白を含む本文画像](./photo%20one.png)\n\n![日本語名の本文画像](./写真.png)\n`,
);
await add(
    "src/content/posts/private/entry.mdx",
    `---\ntitle: 共通する記事タイトル\ndraft: true\nimage: ./private-only.png\n---\n\n${privateBody}\n\n${shared}\n\n![公開記事と共用する画像](../published/shared.png)\n`,
);
await add("src/content/posts/published/shared.png", png);
await add("src/content/posts/published/body.png", png);
await add("src/content/posts/published/photo one.png", png);
await add("src/content/posts/published/写真.png", png);
await add("src/content/posts/private/private-only.png", png);
await add(
    "tests/fixtures/content/posts/independent-sample.mdx",
    `---\ntitle: 独立検証用サンプル\ndate: "2026-09-01"\ndraft: false\n---\n\n${sampleBody}\n`,
);
await add(
    "tests/fixtures/content/posts/published/entry.mdx",
    `---\ntitle: 公開記事と同じIDのサンプル\ndate: "2026-09-01"\ndraft: false\n---\n\n${sampleBody}\n`,
);
build();
const published = await inspect();
assert.equal(published.status, 0, published.log);
const publicHtml = await readFile(
    join(production, "posts/published/entry/index.html"),
    "utf8",
);
const homeHtml = await readFile(join(production, "index.html"), "utf8");
for (const [markup, source] of [
    [homeHtml, "src/content/posts/published/shared.png"],
    [publicHtml, "src/content/posts/published/body.png"],
    [publicHtml, "src/content/posts/published/photo one.png"],
    [publicHtml, "src/content/posts/published/写真.png"],
]) {
    const image = [...markup.matchAll(/<img\b[^>]*>/g)]
        .map(([tag]) => tag)
        .find((tag) => tag.includes(`data-production-source="${source}"`));
    assert(image, `公開画像に相対参照元が記録されます: ${source}`);
    assert.match(image, /\bsrc="\/_astro\//);
    assert(
        !image.includes(fixture) &&
            !image.includes(fixture.replaceAll("\\", "/")),
        "画像属性に作業コピーの絶対パスを含めません",
    );
}
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

await writeFile(join(production, "_astro/private-residual.png"), png);
try {
    const residual = await inspect();
    assert.notEqual(
        residual.status,
        0,
        "参照されない専用画像が残る成果物は失敗します",
    );
    assert.match(residual.log, /private-residual\.png/i, residual.log);
} finally {
    await unlink(join(production, "_astro/private-residual.png"));
}
console.log("本番成果物の独立検証: 参照されない専用画像の残存を検出します。");

const articlePath = "posts/published/entry/index.html";
const articleHtml = await readFile(join(production, articlePath), "utf8");
await writeFile(join(production, "_astro/private-forged.png"), png);
await writeFile(
    join(production, articlePath),
    articleHtml.replace(
        "</body>",
        '<img src="/_astro/private-forged.png" data-production-source="src/content/posts/private/private-only.png"></body>',
    ),
);
try {
    const forged = await inspect();
    assert.notEqual(
        forged.status,
        0,
        "公開ページに参照を追加しても下書き専用画像を許可しません",
    );
    assert.match(
        forged.log,
        /posts[\\/]published[\\/]entry[\\/]index\.html/i,
        forged.log,
    );
} finally {
    await writeFile(join(production, articlePath), articleHtml);
    await unlink(join(production, "_astro/private-forged.png"));
}
console.log(
    "本番成果物の独立検証: 公開ページから参照された下書き専用画像も拒否します。",
);

const about = await readFile(join(production, "about/index.html"), "utf8");
await writeFile(
    join(production, "about/index.html"),
    about.replace("</body>", `<p>${privateBody}</p></body>`),
);
try {
    const leaked = await inspect();
    assert.notEqual(
        leaked.status,
        0,
        "下書きの固有本文が公開HTMLに混入した成果物は失敗します",
    );
    assert.match(leaked.log, /about[\\/]index\.html/i, leaked.log);
} finally {
    await writeFile(join(production, "about/index.html"), about);
}
console.log(
    "本番成果物の独立検証: 下書きの固有本文が公開HTMLへ混入した場合に拒否します。",
);

const sampleListing = homepage.replace(
    /(<div\b[^>]*\bid="article-list"[^>]*>)/,
    '$1<article><h2><a href="/posts/independent-sample/">独立検証用サンプル</a></h2><p>検証用の記事です。</p></article>',
);
assert.notEqual(sampleListing, homepage, "改変対象の記事一覧が存在します");
await writeFile(join(production, "index.html"), sampleListing);
try {
    const listed = await inspect();
    assert.notEqual(
        listed.status,
        0,
        "サンプルをホーム一覧へ追加した成果物は失敗します",
    );
    assert.match(listed.log, /index\.html/i, listed.log);
} finally {
    await writeFile(join(production, "index.html"), homepage);
}
console.log("本番成果物の独立検証: サンプル記事の一覧掲載を検出します。");

await writeFile(
    join(production, "rss.xml"),
    publishedRss.replace(
        "</channel>",
        "<item><title>独立検証用サンプル</title><link>https://blog.devegoma.com/posts/independent-sample/</link></item></channel>",
    ),
);
try {
    const rssSample = await inspect();
    assert.notEqual(
        rssSample.status,
        0,
        "サンプルをRSSへ追加した成果物は失敗します",
    );
    assert.match(rssSample.log, /rss\.xml/i, rssSample.log);
} finally {
    await writeFile(join(production, "rss.xml"), publishedRss);
}
console.log("本番成果物の独立検証: サンプル記事のRSS混入を検出します。");

const sitemap = await readFile(join(production, "sitemap.xml"), "utf8");
await writeFile(
    join(production, "sitemap.xml"),
    sitemap.replace(
        "</urlset>",
        "<url><loc>https://blog.devegoma.com/posts/independent-sample/</loc></url></urlset>",
    ),
);
try {
    const sitemapSample = await inspect();
    assert.notEqual(
        sitemapSample.status,
        0,
        "サンプルをサイトマップへ追加した成果物は失敗します",
    );
    assert.match(sitemapSample.log, /sitemap\.xml/i, sitemapSample.log);
} finally {
    await writeFile(join(production, "sitemap.xml"), sitemap);
}
console.log(
    "本番成果物の独立検証: サンプル記事のサイトマップ混入を検出します。",
);

await writeFile(
    join(production, "search-data.json"),
    JSON.stringify({ body: sampleBody }),
);
try {
    const dataSample = await inspect();
    assert.notEqual(
        dataSample.status,
        0,
        "テキストデータにサンプルの固有本文が混入した成果物は失敗します",
    );
    assert.match(dataSample.log, /search-data\.json/i, dataSample.log);
} finally {
    await unlink(join(production, "search-data.json"));
}
console.log(
    "本番成果物の独立検証: テキストデータへのサンプル本文混入を検出します。",
);

await unlink(join(production, articlePath));
try {
    const missingArticle = await inspect();
    assert.notEqual(
        missingArticle.status,
        0,
        "公開記事の本文ページが欠落した成果物は失敗します",
    );
    assert.match(
        missingArticle.log,
        /posts[\\/]published[\\/]entry[\\/]index\.html/i,
        missingArticle.log,
    );
} finally {
    await writeFile(join(production, articlePath), articleHtml);
}
console.log("本番成果物の独立検証: 公開記事の本文ページ欠落を検出します。");
console.log(
    `Production artifact case checks passed: 13 scenarios (2 normal, 11 modified), 2 builds, ${((performance.now() - started) / 1000).toFixed(1)}s.`,
);
