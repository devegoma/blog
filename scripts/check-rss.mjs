import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
    cp,
    mkdir,
    mkdtemp,
    readFile,
    unlink,
    writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import sax from "sax";

// Build isolated articles without changing the author's content or cache.
const root = resolve(import.meta.dirname, "..");
await mkdir(join(root, "test-results"), { recursive: true });
const fixture = await mkdtemp(join(root, "test-results/rss-"));
await cp(join(root, "src"), join(fixture, "src"), {
    recursive: true,
    filter: (path) => path !== join(root, "src/content/posts"),
});
for (const file of ["astro.config.mjs", "package.json", "tsconfig.json"])
    await cp(join(root, file), join(fixture, file));
await mkdir(join(fixture, "src/content/posts"), { recursive: true });

async function writePost(path, data, body = "FULL_RSS_BODY_MUST_NOT_LEAK") {
    const file = join(fixture, "src/content/posts", path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `---\n${JSON.stringify(data)}\n---\n\n${body}\n`);
}

const children = (node, name) =>
    node.children.filter((child) => child.name === name);
const text = (node, name) => children(node, name)[0]?.text;

function parse(xml) {
    const parser = sax.parser(true);
    const stack = [];
    let document;
    parser.onopentag = ({ name, attributes }) => {
        const node = { name, attributes, text: "", children: [] };
        if (stack.length) stack.at(-1).children.push(node);
        else document = node;
        stack.push(node);
    };
    parser.ontext = parser.oncdata = (value) => {
        if (stack.length) stack.at(-1).text += value;
    };
    parser.onclosetag = () => stack.pop();
    parser.write(xml).close();
    assert.equal(document.name, "rss");
    assert.equal(document.attributes.version, "2.0");
    const channel = children(document, "channel")[0];
    assert(channel, "RSS channel is missing");
    return { channel, items: children(channel, "item") };
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
    return parse(await readFile(join(fixture, "dist/rss.xml"), "utf8"));
}

async function assertHttpFeed(command, expected) {
    const listener = createServer();
    await new Promise((done) => listener.listen(0, "127.0.0.1", done));
    const port = listener.address().port;
    await new Promise((done) => listener.close(done));
    const base = `http://127.0.0.1:${port}`;
    const server = spawn(
        process.execPath,
        [
            join(root, "node_modules/astro/bin/astro.mjs"),
            command,
            "--host",
            "127.0.0.1",
            "--port",
            String(port),
        ],
        { cwd: fixture, env: { ...process.env, SHOW_DRAFTS: "true" } },
    );
    let log = "";
    server.stdout.on("data", (chunk) => {
        log += chunk;
    });
    server.stderr.on("data", (chunk) => {
        log += chunk;
    });
    try {
        const deadline = Date.now() + 30000;
        let response;
        while (Date.now() < deadline) {
            assert.equal(server.exitCode, null, log);
            try {
                response = await fetch(`${base}/rss.xml`, {
                    signal: AbortSignal.timeout(3000),
                });
                if (response.ok) break;
            } catch {
                /* Wait until our own server accepts connections. */
            }
            await setTimeout(200);
        }
        assert.equal(response?.status, 200, log);
        assert.match(
            response.headers.get("content-type"),
            /(?:application|text)\/(?:rss\+)?xml/,
        );
        const xml = await response.text();
        assert.deepEqual(parse(xml).items, expected.items);
        assert(!xml.includes("DRAFT_RSS"));
        assert(!xml.includes("UNPUBLISHED_RSS"));
        for (const item of expected.items) {
            const link = new URL(text(item, "link"));
            assert.equal(link.origin, "https://blog.devegoma.com");
            assert.equal(text(item, "guid"), link.href);
            assert.equal(
                (await fetch(`${base}${link.pathname}`)).status,
                200,
                link.href,
            );
        }
        if (command === "dev") {
            const draft = await fetch(`${base}/posts/draft-true/`);
            assert.equal(draft.status, 200);
            assert((await draft.text()).includes("DRAFT_RSS_BODY"));
        }
    } finally {
        if (server.exitCode === null) {
            const exited = once(server, "exit");
            server.kill();
            await exited;
        }
    }
}

const empty = await build();
assert.equal(empty.items.length, 0);
assert.equal(text(empty.channel, "title"), "devegoma's blog");
assert.equal(text(empty.channel, "link"), "https://blog.devegoma.com/");
assert.equal(
    text(empty.channel, "description"),
    "読んだ本、試した道具。日々の学びを記録する devegoma の個人ブログ。",
);
assert.equal(text(empty.channel, "language"), "ja");
await assertHttpFeed("preview", empty);
await writePost("special.mdx", {
    title: '日本語 & <学び> "記録"',
    description: "道具 & <比較>を試す。",
    date: "2026-09-02",
    updated: "2026-10-01",
    draft: false,
});
const single = await build();
assert.equal(single.items.length, 1);
const item = single.items[0];
assert.equal(text(item, "title"), '日本語 & <学び> "記録"');
assert.equal(text(item, "description"), "道具 & <比較>を試す。");
assert.equal(text(item, "link"), "https://blog.devegoma.com/posts/special/");
assert.equal(text(item, "guid"), "https://blog.devegoma.com/posts/special/");
assert.equal(children(item, "guid")[0].attributes.isPermaLink, "true");
assert.equal(text(item, "pubDate"), "Tue, 01 Sep 2026 15:00:00 GMT");
assert.equal(children(item, "content:encoded").length, 0);
assert(
    !(await readFile(join(fixture, "dist/rss.xml"), "utf8")).includes(
        "FULL_RSS_BODY_MUST_NOT_LEAK",
    ),
);
for (let index = 18; index >= 0; index--) {
    const number = String(index).padStart(2, "0");
    await writePost(`batch/${number}.mdx`, {
        title: `順序${number}`,
        description: `概要${number}`,
        date: "2026-09-01",
        updated: "2026-10-31",
        draft: false,
    });
}
const twenty = await build();
assert.equal(twenty.items.length, 20);
assert.deepEqual(
    twenty.items.map((entry) => text(entry, "link")),
    [
        "https://blog.devegoma.com/posts/special/",
        ...Array.from(
            { length: 19 },
            (_, index) =>
                `https://blog.devegoma.com/posts/batch/${String(index).padStart(2, "0")}/`,
        ),
    ],
);
await writePost("older.mdx", {
    title: "21件目の古い記事",
    description: "配信対象外の古い概要",
    date: "2026-08-31",
    draft: false,
});
const twentyOne = await build();
assert.equal(twentyOne.items.length, 20);
assert.deepEqual(twentyOne.items, twenty.items);
await writePost(
    "body-only.mdx",
    { title: "本文からの概要", date: "2026-09-03", draft: false },
    "## 見出し\n\n```js\nconst hidden = true;\n```\n\n" +
        "本文".repeat(70) +
        "FULL_AFTER_SUMMARY",
);
await writePost(
    "table-only.mdx",
    { title: "表とコードのみ", date: "2026-09-03", draft: false },
    "```js\nconst hidden = true;\n```\n\n| 表 |\n| --- |\n| 内容 |",
);
const twentyThree = await build();
assert.equal(twentyThree.items.length, 20);
assert.equal(text(twentyThree.items[0], "description"), "本文".repeat(60));
assert.equal(text(twentyThree.items[1], "description"), "表とコードのみ");
assert.deepEqual(
    twentyThree.items.map((entry) => text(entry, "link")),
    [
        "https://blog.devegoma.com/posts/body-only/",
        "https://blog.devegoma.com/posts/table-only/",
        "https://blog.devegoma.com/posts/special/",
        ...Array.from(
            { length: 17 },
            (_, index) =>
                `https://blog.devegoma.com/posts/batch/${String(index).padStart(2, "0")}/`,
        ),
    ],
);
const limitedXml = await readFile(join(fixture, "dist/rss.xml"), "utf8");
for (const excluded of [
    "FULL_AFTER_SUMMARY",
    "FULL_RSS_BODY_MUST_NOT_LEAK",
    "配信対象外の古い概要",
    "/posts/older/",
    "順序17",
    "概要18",
])
    assert(!limitedXml.includes(excluded), excluded);
for (const draft of [true, undefined]) {
    await writePost(
        `draft-${String(draft)}.mdx`,
        {
            title: `DRAFT_RSS_TITLE_${String(draft)}`,
            description: "DRAFT_RSS_DESCRIPTION",
            date: "2099-09-01",
            draft,
        },
        "DRAFT_RSS_BODY",
    );
}
const withDrafts = await build();
assert.deepEqual(withDrafts.items, twentyThree.items);
assert(
    !(await readFile(join(fixture, "dist/rss.xml"), "utf8")).includes(
        "DRAFT_RSS",
    ),
);
await writePost("body-only.mdx", {
    title: "修正したタイトル",
    description: "修正後の概要。",
    date: "2026-09-03",
    updated: "2026-10-31",
    draft: false,
});
const updated = await build();
assert.equal(updated.items.length, 20);
assert.equal(text(updated.items[0], "title"), "修正したタイトル");
assert.equal(text(updated.items[0], "description"), "修正後の概要。");
assert.equal(text(updated.items[0], "guid"), text(withDrafts.items[0], "guid"));
assert.equal(
    text(updated.items[0], "pubDate"),
    text(withDrafts.items[0], "pubDate"),
);

await unlink(join(fixture, "src/content/posts/table-only.mdx"));
await writePost("special.mdx", {
    title: "UNPUBLISHED_RSS_TITLE",
    description: "UNPUBLISHED_RSS_DESCRIPTION",
    date: "2026-09-02",
    draft: true,
});
const removed = await build();
assert.equal(removed.items.length, 20);
for (const path of ["table-only", "special"]) {
    assert(
        !removed.items.some(
            (entry) =>
                text(entry, "link") ===
                `https://blog.devegoma.com/posts/${path}/`,
        ),
    );
    await assert.rejects(
        readFile(join(fixture, "dist/posts", path, "index.html")),
        { code: "ENOENT" },
    );
}
assert(
    !(await readFile(join(fixture, "dist/rss.xml"), "utf8")).includes(
        "UNPUBLISHED_RSS",
    ),
);
await assertHttpFeed("preview", removed);
await assertHttpFeed("dev", removed);
console.log(
    "RSS checks passed: empty/20/21+ items, shared summaries, stable identity, deletion/draft changes, XML, HTTP headers and article links in production and development.",
);
