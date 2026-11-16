import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getBuildTarget } from "./src/config/build-target.mjs";

const target = getBuildTarget();
const verificationPublic = new URL(
    "./.astro-verification/public/",
    import.meta.url,
);

export default defineConfig({
    site: "https://blog.devegoma.com",
    output: "static",
    outDir: target.outputDirectory,
    cacheDir: target.cacheDirectory,
    publicDir: target.verification
        ? fileURLToPath(verificationPublic)
        : "./public",
    trailingSlash: "always",
    ...(!target.verification
        ? {
              image: {
                  service: {
                      entrypoint: "./src/config/production-image-service.mjs",
                      config: {
                          root: fileURLToPath(new URL("./", import.meta.url)),
                      },
                  },
              },
          }
        : {}),
    integrations: [
        mdx(),
        ...(target.verification
            ? [
                  {
                      name: "verification-public-assets",
                      hooks: {
                          "astro:config:setup": async () => {
                              await rm(verificationPublic, {
                                  recursive: true,
                                  force: true,
                              });
                              await mkdir(verificationPublic, {
                                  recursive: true,
                              });
                              await cp(
                                  new URL("./public/", import.meta.url),
                                  verificationPublic,
                                  { recursive: true },
                              );
                              await cp(
                                  new URL(
                                      "./tests/fixtures/public/",
                                      import.meta.url,
                                  ),
                                  verificationPublic,
                                  { recursive: true },
                              );
                          },
                      },
                  },
              ]
            : []),
    ],
    markdown: { shikiConfig: { theme: "github-dark" } },
    vite: { plugins: [tailwindcss()] },
});
