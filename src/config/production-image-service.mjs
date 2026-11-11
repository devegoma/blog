import sharp from "astro/assets/services/sharp";
import { relative } from "node:path";

// Astro 7 preserves fsPath on image metadata; keep its use at this adapter.
export default {
    ...sharp,
    getHTMLAttributes(options, config, logger) {
        const attributes = sharp.getHTMLAttributes(options, config, logger);
        const path = typeof options.src === "object" && options.src.fsPath;
        if (path) {
            const source = relative(
                config.service.config.root,
                path,
            ).replaceAll("\\", "/");
            if (source.startsWith("src/content/posts/"))
                attributes["data-production-source"] = source;
        }
        return attributes;
    },
};
