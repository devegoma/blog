import { getCollection } from "astro:content";
import { comparePosts } from "../utils/post-order.mjs";

// Detail pages, lists and tags share this publication boundary.
export async function getPosts({ includeDrafts = import.meta.env.DEV } = {}) {
    const entries = await getCollection(
        "posts",
        ({ data }) => includeDrafts || !data.draft,
    );
    return entries
        .map((entry) => {
            const id = entry.id;
            return {
                ...entry.data,
                id,
                date: entry.data.date ?? "",
                description: entry.data.description ?? entry.data.title,
                minutes:
                    entry.data.minutes ??
                    Math.max(1, Math.ceil((entry.body?.length ?? 0) / 600)),
                href: `/posts/${id}/`,
                entry,
            };
        })
        .sort(comparePosts);
}

export function tagHref(tag: string) {
    return `/tags/${encodeURIComponent(tag)}/`;
}
