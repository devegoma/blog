import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { postLoader } from "./config/post-loader.mjs";
import { createPostSchema } from "./data/post-schema.mjs";
import { tags } from "./data/tags";
import { z } from "astro/zod";
import { getBuildTarget } from "./config/build-target.mjs";

const { verification, postsDirectory } = getBuildTarget();
const postsDisplayDirectory = postsDirectory.replace(/^\.\//, "");

const posts = defineCollection({
    loader: postLoader(
        glob({
            base: postsDirectory,
            pattern: "**/*.mdx",
            generateId: ({ entry, data }) => {
                const path = entry.replaceAll("\\", "/");
                const match =
                    /^([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)\.mdx$/.exec(
                        path,
                    );
                if (!match)
                    throw new Error(
                        `記事の配置が不正です: ${postsDisplayDirectory}/${path}。フォルダ名・ファイル名には小文字の半角英数字とハイフンを使用してください`,
                    );
                if (Object.hasOwn(data, "slug"))
                    throw new Error(
                        `slug は指定できません: ${postsDisplayDirectory}/${path}。URLには記事のフォルダとファイル名を使用します`,
                    );
                return match[1];
            },
        }),
    ),
    schema: ({ image }) =>
        createPostSchema(
            tags,
            undefined,
            verification
                ? z.string().startsWith("/images/")
                : z.preprocess((value, ctx) => {
                      if (
                          typeof value !== "string" ||
                          !value.startsWith("./")
                      ) {
                          ctx.addIssue({
                              code: "custom",
                              message:
                                  "記事画像には記事の隣の相対パス（./...）を指定してください",
                          });
                          return z.NEVER;
                      }
                      return value;
                  }, image()),
        ),
});

export const collections = { posts };
