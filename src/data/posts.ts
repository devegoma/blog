import { getCollection } from "astro:content";

// Detail pages, lists and tags share this publication boundary.
export async function getPosts() {
    const entries = await getCollection(
        "posts",
        ({ data }) => import.meta.env.DEV || !data.draft,
    );
    const ids = new Set<string>();
    return entries
        .map((entry) => {
            const id = entry.data.slug ?? entry.id;
            if (ids.has(id)) throw new Error(`記事URLが重複しています: ${id}`);
            ids.add(id);
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
        .sort(
            (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
        );
}

export function tagHref(tag: string) {
    return `/tags/${encodeURIComponent(tag)}/`;
}
