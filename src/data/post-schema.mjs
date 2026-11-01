import { z } from "astro/zod";

/**
 * @param {Record<string, unknown>} tagDefinitions
 * @param {Date} [now] Fixed test clock; omitted time is read on each validation.
 */
export function createPostSchema(tagDefinitions, now) {
    return z
        .object({
            title: z.string().trim().min(1),
            description: z.string().optional(),
            date: z.iso.date().optional(),
            updated: z.iso.date().optional(),
            tags: z
                .array(
                    z.string().superRefine((id, ctx) => {
                        if (!Object.hasOwn(tagDefinitions, id))
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
            }).format(now ?? new Date());
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
        });
}
