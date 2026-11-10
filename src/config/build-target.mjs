export function getBuildTarget(value = process.env.BLOG_BUILD_TARGET) {
    if (
        value !== undefined &&
        value !== "production" &&
        value !== "verification"
    )
        throw new Error(`BLOG_BUILD_TARGET の値が不正です: ${value}`);
    const verification = value === "verification";
    return {
        verification,
        postsDirectory: verification
            ? "./tests/fixtures/content/posts"
            : "./src/content/posts",
        outputDirectory: verification ? "./dist-verification" : "./dist",
        cacheDirectory: verification
            ? "./.astro-verification/cache"
            : "./.astro/cache",
    };
}
