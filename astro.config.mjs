import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    site: "https://blog.devegoma.com",
    output: "static",
    trailingSlash: "always",
    integrations: [mdx()],
    markdown: { shikiConfig: { theme: "github-dark" } },
    vite: { plugins: [tailwindcss()] },
});
