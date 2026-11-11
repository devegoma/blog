import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join, relative, dirname } from "node:path";
import { parseFrontmatter } from "astro/markdown";
import assert from "node:assert/strict";
import sax from "sax";
import { comparePosts } from "../src/utils/post-order.mjs";
import { generateSummary } from "../src/utils/post-summary.mjs";
import { mdxToMdast } from "satteri";
import { chromium } from "@playwright/test";

const directory = resolve(process.argv[2] ?? "dist");
const root = resolve(process.argv[3] ?? join(import.meta.dirname, ".."));
try {
    const posts = [];
    for (const [folder, sample] of [
        ["src/content/posts", false],
        ["tests/fixtures/content/posts", true],
    ]) {
        for (const file of await files(join(root, folder))) {
            if (!file.endsWith(".mdx")) continue;
            const { frontmatter, content } = parseFrontmatter(
                await readFile(file, "utf8"),
            );
            const id = relative(join(root, folder), file)
                .replaceAll("\\", "/")
                .slice(0, -4);
            posts.push({
                ...frontmatter,
                file,
                id,
                body: content,
                href: `/posts/${id}/`,
                published: !sample && frontmatter.draft === false,
            });
        }
    }
    const output = await files(directory);
    const publicPosts = posts
        .filter((post) => post.published)
        .sort(comparePosts);
    const rssItems = [];
    const parser = sax.parser(true);
    const stack = [];
    let rssItem;
    parser.onopentag = ({ name }) => {
        stack.push(name);
        if (name === "item") rssItems.push((rssItem = {}));
        else if (rssItem && stack.at(-2) === "item") {
            assert(!Object.hasOwn(rssItem, name), `rss.xml: duplicate ${name}`);
            rssItem[name] = "";
        }
    };
    parser.ontext = parser.oncdata = (value) => {
        if (rssItem && stack.at(-2) === "item") rssItem[stack.at(-1)] += value;
    };
    parser.onclosetag = (name) => {
        if (name === "item") rssItem = undefined;
        stack.pop();
    };
    try {
        parser
            .write(await readFile(join(directory, "rss.xml"), "utf8"))
            .close();
    } catch (error) {
        throw new Error(`rss.xml: ${error.message}`);
    }
    assert.equal(
        rssItems.length,
        Math.min(publicPosts.length, 20),
        `rss.xml: item count; expected ${publicPosts
            .slice(0, 20)
            .map((post) => post.href)
            .join(", ")}`,
    );
    for (const [index, item] of rssItems.entries()) {
        const post = publicPosts[index];
        assert.equal(
            item.link,
            `https://blog.devegoma.com${post.href}`,
            `rss.xml: link ${post.href}`,
        );
        assert.equal(
            item.title,
            post.title.trim(),
            `rss.xml: title ${post.href}`,
        );
        assert.equal(
            item.description,
            generateSummary(post),
            `rss.xml: description ${post.href}`,
        );
        assert.equal(
            item.pubDate,
            new Date(`${post.date}T00:00:00+09:00`).toUTCString(),
            `rss.xml: date ${post.href}`,
        );
    }
    const expected = new Set([
        "index.html",
        "about/index.html",
        "tags/index.html",
    ]);
    const addPage = (path) =>
        expected.add(`${path.replace(/^\//, "")}index.html`);
    for (const post of publicPosts) addPage(post.href);
    for (let page = 2; page <= Math.ceil(publicPosts.length / 10); page++)
        addPage(`/page/${page}/`);
    for (const tag of new Set(publicPosts.flatMap((post) => post.tags ?? []))) {
        const count = publicPosts.filter((post) =>
            post.tags?.includes(tag),
        ).length;
        addPage(`/tags/${encodeURIComponent(tag)}/`);
        for (let page = 2; page <= Math.ceil(count / 10); page++)
            addPage(`/tags/${encodeURIComponent(tag)}/page/${page}/`);
    }
    for (const month of new Set(
        publicPosts.map((post) => post.date.slice(0, 7)),
    ))
        addPage(`/archives/${month}/`);
    const actual = output
        .map((file) => relative(directory, file).replaceAll("\\", "/"))
        .filter((file) => file.endsWith(".html") && file !== "404.html");
    assert.deepEqual(
        actual.sort(),
        [...expected].sort(),
        "HTML files: published input and output pages differ",
    );
    const textOutput = (
        await Promise.all(
            output
                .filter((file) => /\.(?:html|css)$/i.test(file))
                .map((file) => readFile(file, "utf8")),
        )
    ).join("\n");
    const common = new Set(
        (await files(join(root, "public"))).map((file) =>
            relative(join(root, "public"), file).replaceAll("\\", "/"),
        ),
    );
    for (const file of output.filter((file) =>
        /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(file),
    )) {
        const path = relative(directory, file).replaceAll("\\", "/");
        if (common.has(path))
            assert.deepEqual(
                await readFile(file),
                await readFile(join(root, "public", path)),
                `${path}: common image differs from input`,
            );
        else
            assert(
                textOutput.includes(`/${path}`),
                `${path}: unreferenced article image`,
            );
    }
    const allowedSources = new Set();
    for (const post of publicPosts) {
        for (const image of imageReferences(post)) {
            const source = relative(
                root,
                resolve(dirname(post.file), image),
            ).replaceAll("\\", "/");
            assert(
                source.startsWith("src/content/posts/"),
                `${post.href}: article image outside posts: ${source}`,
            );
            await readFile(join(root, source));
            allowedSources.add(source);
        }
    }
    const referencedImages = new Set();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage({ javaScriptEnabled: false });
        await page.route("**/*", (route) => route.abort());
        for (const path of actual.concat("404.html")) {
            await page.setContent(
                await readFile(join(directory, path), "utf8"),
            );
            const pathname = `/${path.replace(/index\.html$/, "")}`;
            let listing;
            if (path === "index.html") listing = publicPosts.slice(0, 10);
            const homePage = /^\/page\/(\d+)\/$/.exec(pathname);
            if (homePage)
                listing = publicPosts.slice(
                    (Number(homePage[1]) - 1) * 10,
                    Number(homePage[1]) * 10,
                );
            const tagPage = /^\/tags\/([^/]+)\/(?:page\/(\d+)\/)?$/.exec(
                pathname,
            );
            if (tagPage)
                listing = publicPosts
                    .filter((post) =>
                        post.tags?.includes(decodeURIComponent(tagPage[1])),
                    )
                    .slice(
                        (Number(tagPage[2] ?? 1) - 1) * 10,
                        Number(tagPage[2] ?? 1) * 10,
                    );
            const monthPage = /^\/archives\/([^/]+)\/$/.exec(pathname);
            if (monthPage)
                listing = publicPosts.filter((post) =>
                    post.date.startsWith(monthPage[1]),
                );
            if (listing) {
                const items = await page
                    .locator("#article-list > article")
                    .evaluateAll((nodes) =>
                        nodes.map((node) => ({
                            href: node
                                .querySelector("h2 a")
                                ?.getAttribute("href"),
                            title: node
                                .querySelector("h2")
                                ?.textContent?.trim(),
                            description: node
                                .querySelector(".article-copy > p")
                                ?.textContent?.trim(),
                        })),
                    );
                assert.deepEqual(
                    items,
                    listing.map((post) => ({
                        href: post.href,
                        title: post.title.trim(),
                        description: generateSummary(post),
                    })),
                    `${path}: article listing differs from public input`,
                );
            }
            const images = await page.locator("img").evaluateAll((images) =>
                images.map((image) => ({
                    src: image.getAttribute("src"),
                    srcset: image.getAttribute("srcset"),
                    source: image.getAttribute("data-production-source"),
                    picture: [
                        ...(image
                            .closest("picture")
                            ?.querySelectorAll("source") ?? []),
                    ].map((source) => source.getAttribute("srcset") ?? ""),
                })),
            );
            for (const image of images) {
                const urls = [
                    image.src,
                    ...[image.srcset, ...image.picture]
                        .filter(Boolean)
                        .flatMap((set) =>
                            set
                                .split(",")
                                .map((part) => part.trim().split(/\s/)[0]),
                        ),
                ].filter(Boolean);
                for (const value of urls) {
                    const url = new URL(
                        value,
                        `https://blog.devegoma.com/${path.replace(/index\.html$/, "")}`,
                    );
                    if (url.origin !== "https://blog.devegoma.com") continue;
                    const imagePath = decodeURIComponent(url.pathname).slice(1);
                    assert(
                        !imagePath.split("/").includes("..") &&
                            !imagePath.includes("\\"),
                        `${path}: invalid image path ${value}`,
                    );
                    await readFile(join(directory, imagePath));
                    if (!common.has(imagePath)) {
                        assert(
                            allowedSources.has(image.source),
                            `${path}: image ${imagePath} has unpublished or missing source ${image.source}`,
                        );
                        referencedImages.add(imagePath);
                    }
                }
            }
        }
    } finally {
        await browser.close();
    }
    for (const file of output.filter((file) =>
        /\.(?:png|jpe?g|gif|webp|avif|svg|ico)$/i.test(file),
    )) {
        const path = relative(directory, file).replaceAll("\\", "/");
        assert(
            common.has(path) || referencedImages.has(path),
            `${path}: article image without a public source reference`,
        );
    }
    for (const file of output) {
        const bytes = await readFile(file);
        for (const post of posts.filter((post) => !post.published)) {
            if (
                !publicPosts.some((entry) => entry.href === post.href) &&
                bytes.includes(Buffer.from(post.href))
            )
                throw new Error(
                    `${relative(directory, file)}: unpublished article URL ${post.href}`,
                );
            const publicText = publicPosts
                .map(
                    (entry) =>
                        `${entry.title}\n${entry.description ?? ""}\n${textChunks(entry.body).join("\n")}`,
                )
                .join("\n");
            for (const chunk of textChunks(post.body)) {
                if (
                    chunk.length >= 16 &&
                    !normalize(publicText).includes(normalize(chunk)) &&
                    normalize(bytes.toString("utf8")).includes(normalize(chunk))
                )
                    throw new Error(
                        `${relative(directory, file)}: unpublished article body ${post.href}`,
                    );
            }
        }
    }
    const result = spawnSync(
        process.execPath,
        [join(import.meta.dirname, "check-search-artifacts.mjs"), directory],
        { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    console.log(
        `Production artifact checks passed: ${directory} (input: ${root}).`,
    );
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}

async function files(directory) {
    return (await readdir(directory, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name));
}

function normalize(value) {
    return value.replace(/\s+/gu, " ").trim();
}
function textChunks(body) {
    const chunks = [];
    const text = (node) =>
        ["text", "inlineCode", "code"].includes(node.type)
            ? node.value
            : (node.children ?? []).map(text).join("");
    const visit = (node) => {
        if (["paragraph", "heading", "code"].includes(node.type))
            chunks.push(normalize(text(node)));
        else for (const child of node.children ?? []) visit(child);
    };
    visit(mdxToMdast(body));
    return chunks.filter(Boolean);
}

function imageReferences(post) {
    const images = [];
    if (typeof post.image === "string") images.push(post.image);
    const tree = mdxToMdast(post.body);
    const definitions = new Map();
    const collect = (node) => {
        if (node.type === "definition")
            definitions.set(node.identifier, node.url);
        for (const child of node.children ?? []) collect(child);
    };
    collect(tree);
    const visit = (node) => {
        if (node.type === "image") images.push(node.url);
        if (node.type === "imageReference" && definitions.has(node.identifier))
            images.push(definitions.get(node.identifier));
        if (node.type === "mdxjsEsm")
            for (const match of node.value.matchAll(
                /\bfrom\s*["']([^"']+\.(?:png|jpe?g|gif|webp|avif|svg))["']/gi,
            ))
                images.push(match[1]);
        for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
    return images.filter((image) => image.startsWith("."));
}
