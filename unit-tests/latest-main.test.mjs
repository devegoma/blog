import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { checkout, createRemote, git } from "./helpers/ci-git.mjs";

const script = fileURLToPath(
    new URL("../scripts/check-latest-main.mjs", import.meta.url),
);
for (const state of [
    "latest",
    "stale",
    "missing-main",
    "unavailable",
    "invalid-target",
]) {
    test(`latest-main guard: ${state}`, (t) => {
        const root = mkdtempSync(path.join(tmpdir(), "latest-main-"));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        const {
            remote,
            commits: [a, b],
        } = createRemote(root);
        const work = path.join(root, "work");
        mkdirSync(work);
        checkout(work, remote);
        if (state === "stale")
            git(["-C", remote, "update-ref", "refs/heads/main", b]);
        if (state === "missing-main")
            git(["-C", remote, "update-ref", "-d", "refs/heads/main"]);
        if (state === "unavailable")
            git([
                "-C",
                work,
                "remote",
                "set-url",
                "origin",
                path.join(root, "absent"),
            ]);
        const output = path.join(root, "output");
        const summary = path.join(root, "summary");
        const result = spawnSync(process.execPath, [script], {
            cwd: work,
            encoding: "utf8",
            env: {
                ...process.env,
                GITHUB_SHA: state === "invalid-target" ? "invalid" : a,
                GITHUB_OUTPUT: output,
                GITHUB_STEP_SUMMARY: summary,
            },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(
            readFileSync(output, "utf8"),
            `publish=${state === "latest"}\n`,
        );
        assert.equal(
            readFileSync(summary, "utf8").trim(),
            result.stdout.trim(),
        );
        assert(
            result.stdout.includes(
                state === "latest"
                    ? "reason=latest-main"
                    : state === "stale"
                      ? "reason=stale-commit"
                      : state === "invalid-target"
                        ? "reason=invalid-target"
                        : "reason=main-unavailable",
            ),
        );
        assert(
            result.stdout.includes(
                `target=${state === "invalid-target" ? "invalid" : a}`,
            ),
        );
        assert(
            result.stdout.includes(
                `latest-main=${state === "latest" ? a : state === "stale" ? b : "unknown"}`,
            ),
        );
    });
}
