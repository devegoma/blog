import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const target = process.env.GITHUB_SHA;
let latest = "unknown";
let reason = "invalid-target";
if (/^[a-f0-9]{40}$/.test(target ?? "")) {
    try {
        const response = execFileSync(
            "git",
            ["ls-remote", "--exit-code", "origin", "refs/heads/main"],
            {
                encoding: "utf8",
                timeout: 15000,
                stdio: ["ignore", "pipe", "pipe"],
            },
        ).trim();
        const match = /^([a-f0-9]{40})\trefs\/heads\/main$/.exec(response);
        reason = "invalid-response";
        if (match) {
            latest = match[1];
            reason = latest === target ? "latest-main" : "stale-commit";
        }
    } catch {
        // Remote errors can include credential-bearing URLs; only log the decision.
        reason = "main-unavailable";
    }
}
const publish = reason === "latest-main";
const summary = `Production publication: target=${/^[a-f0-9]{40}$/.test(target ?? "") ? target : "invalid"} latest-main=${latest} decision=${publish ? "publish" : "skip"} reason=${reason}\n`;
console.log(summary.trim());
assert(process.env.GITHUB_OUTPUT, "GITHUB_OUTPUT is required");
appendFileSync(process.env.GITHUB_OUTPUT, `publish=${publish}\n`);
if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
