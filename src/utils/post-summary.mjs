import { mdxToMdast } from "satteri";

const characters = new Intl.Segmenter("ja", { granularity: "grapheme" });

function paragraphText(node) {
    if (node.type === "text") return node.value;
    if (node.type === "break") return " ";
    if (
        ["paragraph", "link", "linkReference", "emphasis", "strong"].includes(
            node.type,
        )
    )
        return node.children.map(paragraphText).join("");
    return "";
}

export function generateSummary({ description, body = "", title }) {
    if (description?.trim()) return description.trim();
    const tree = mdxToMdast(body);
    const summary = tree.children
        .filter((node) => node.type === "paragraph")
        .map(paragraphText)
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim();
    return summary
        ? Array.from(characters.segment(summary), ({ segment }) => segment)
              .slice(0, 120)
              .join("")
        : title;
}
