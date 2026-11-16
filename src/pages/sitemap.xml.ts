import type { APIRoute } from "astro";
import { getPosts, tagHref } from "../data/posts";

export const GET: APIRoute = async ({ site }) => {
    const posts = await getPosts();
    const paths = ["/", "/about/", "/tags/"];
    for (let page = 2; page <= Math.ceil(posts.length / 10); page++)
        paths.push(`/page/${page}/`);
    paths.push(...posts.map((post) => post.href));
    for (const tag of new Set(posts.flatMap((post) => post.tags))) {
        paths.push(tagHref(tag));
        const count = posts.filter((post) => post.tags.includes(tag)).length;
        for (let page = 2; page <= Math.ceil(count / 10); page++)
            paths.push(`${tagHref(tag)}page/${page}/`);
    }
    for (const month of new Set(posts.map((post) => post.date.slice(0, 7))))
        paths.push(`/archives/${month}/`);
    const urls = paths
        .map((path) => `<url><loc>${new URL(path, site).href}</loc></url>`)
        .join("");
    return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
        { headers: { "Content-Type": "application/xml; charset=utf-8" } },
    );
};
