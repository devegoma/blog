import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
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
    schema: z
        .object({
            title: z.string().trim().min(1),
            description: z.string().optional(),
            date: z.iso.date().optional(),
            updated: z.iso.date().optional(),
            tags: z
                .array(
                    z.string().superRefine((id, ctx) => {
                        if (!Object.hasOwn(tags, id))
                            ctx.addIssue({
                                code: "custom",
                                message: `未定義のタグです: ${id}`,
                            });
                    }),
                )
                .default([])
                .transform((ids) => [...new Set(ids)]),
            minutes: z.number().int().positive().optional(),
            image: z.string().startsWith("/images/").optional(),
            draft: z.boolean().default(true),
        })
        .superRefine((data, ctx) => {
            if (data.draft) return;
            const today = new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Tokyo",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date());
            if (!data.date)
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message: "公開記事には公開日が必要です",
                });
            if (data.date && data.date > today)
                ctx.addIssue({
                    code: "custom",
                    path: ["date"],
                    message: "未来の公開日は指定できません",
                });
            if (
                data.updated &&
                (data.updated > today ||
                    (data.date && data.updated < data.date))
            )
                ctx.addIssue({
                    code: "custom",
                    path: ["updated"],
                    message:
                        "更新日は公開日以降かつ日本時間の今日以前にしてください",
                });
        }),
});

export const collections = { posts };
