import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { tags } from "./data/tags";

const posts = defineCollection({
    loader: glob({
        base: "./src/content/posts",
        pattern: "*.mdx",
        generateId: ({ entry }) => entry.replace(/\.mdx$/, ""),
    }),
    schema: z
        .object({
            title: z.string().trim().min(1),
            slug: z
                .string()
                .regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/)
                .optional(),
            description: z.string().optional(),
            date: z.iso.date().optional(),
            updated: z.iso.date().optional(),
            tags: z
                .array(
                    z
                        .string()
                        .refine(
                            (id) => Object.hasOwn(tags, id),
                            "未定義のタグです",
                        ),
                )
                .default([]),
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
            if (!data.slug)
                ctx.addIssue({
                    code: "custom",
                    path: ["slug"],
                    message: "公開記事にはURL用固定名が必要です",
                });
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
