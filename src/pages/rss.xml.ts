import type { APIRoute } from "astro";
import rss from "@astrojs/rss";
import { getPosts } from "../data/posts";

export const GET: APIRoute = async ({ site }) =>
    rss({
        title: "devegoma's blog",
        description:
            "読んだ本、試した道具。日々の学びを記録する devegoma の個人ブログ。",
        site: new URL("/", site),
        customData: "<language>ja</language>",
        items: (await getPosts()).slice(0, 20).map((post) => ({
            title: post.title,
            description: post.summary,
            link: post.href,
            pubDate: new Date(`${post.date}T00:00:00+09:00`),
        })),
    });
