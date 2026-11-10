/**
 * Keep draft data available for validation without compiling its MDX or images
 * into a static build. Dev keeps the original entries for article previews.
 * @param {import("astro/loaders").Loader} loader
 * @returns {import("astro/loaders").Loader}
 */
export function postLoader(loader) {
    return {
        ...loader,
        name: "posts-with-draft-previews",
        async load(context) {
            await loader.load(context);
            if (context.watcher) return;
            for (const entry of context.store.values()) {
                if (entry.data.draft === false) continue;
                context.store.set({
                    ...entry,
                    deferredRender: false,
                    assetImports: [],
                    imageImports: [],
                    rendered: undefined,
                    // Force reparsing when the next dev server restores previews.
                    digest: undefined,
                });
            }
        },
    };
}
