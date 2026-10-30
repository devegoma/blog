// Rename labels here without changing article references or tag URLs.
export const tags: Record<string, string> = {
    typescript: "TypeScript",
    astro: "Astro",
    obsidian: "Obsidian",
    "draft-only": "下書き専用",
};

export function tagLabel(id: string) {
    return tags[id];
}
