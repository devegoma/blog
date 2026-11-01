import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { createPostSchema } from "./data/post-schema.mjs";
import { tags } from "./data/tags";

const posts = defineCollection({
    loader: glob({
        base: "./src/content/posts",
        pattern: "**/*.mdx",
        generateId: ({ entry, data }) => {
            const path = entry.replaceAll("\\", "/");
            const match =
                /^([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)\.mdx$/.exec(
                    path,
                );
            if (!match)
                throw new Error(
                    `記事の配置が不正です: src/content/posts/${path}。フォルダ名・ファイル名には小文字の半角英数字とハイフンを使用してください`,
                );
            if (Object.hasOwn(data, "slug"))
                throw new Error(
                    `slug は指定できません: src/content/posts/${path}。URLには記事のフォルダとファイル名を使用します`,
                );
            return match[1];
        },
    }),
    schema: createPostSchema(tags),
});

export const collections = { posts };
