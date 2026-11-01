import { getCollection } from "astro:content";
import { comparePosts } from "../utils/post-order.mjs";

// Public by default in every environment. Only detail previews opt in to drafts.
export async function getPosts({ includeDrafts = false } = {}) {
    const entries = await getCollection(
        "posts",
        ({ data }) =>
            data.draft === false ||
            (import.meta.env.DEV &&
                includeDrafts &&
                String(import.meta.env.SHOW_DRAFTS ?? "true") === "true"),
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
