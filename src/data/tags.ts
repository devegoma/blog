// Rename labels here without changing article references or tag URLs.
const definitions: [string, string][] = [
    ["typescript", "TypeScript"],
    ["astro", "Astro"],
    ["obsidian", "Obsidian"],
    ["draft-only", "下書き専用"],
];

export const tags: Record<string, string> = {};
for (const [id, label] of definitions) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
        throw new Error(
            `src/data/tags.ts: 固定名の形式が不正です: ${JSON.stringify(id)}`,
        );
    if (Object.hasOwn(tags, id))
        throw new Error(
            `src/data/tags.ts: 固定名が重複しています: ${JSON.stringify(id)}`,
        );
    tags[id] = label;
}

export function tagLabel(id: string) {
    return tags[id];
}
