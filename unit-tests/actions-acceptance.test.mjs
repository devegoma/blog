import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const project = fileURLToPath(new URL("../", import.meta.url));
for (const scenario of ["serialize", "stale", "unavailable"]) {
    test(`Actions acceptance commands: ${scenario}`, (t) => {
        const root = mkdtempSync(path.join(tmpdir(), "actions-acceptance-"));
        t.after(() => rmSync(root, { recursive: true, force: true }));
        mkdirSync(path.join(root, "scripts"));
        mkdirSync(path.join(root, "unit-tests/helpers"), { recursive: true });
        for (const name of [
            "actions-acceptance.mjs",
            "check-latest-main.mjs",
            "ci-artifact.mjs",
        ])
            cpSync(
                path.join(project, "scripts", name),
                path.join(root, "scripts", name),
            );
        cpSync(
            path.join(project, "unit-tests/helpers/ci-git.mjs"),
            path.join(root, "unit-tests/helpers/ci-git.mjs"),
        );
        const output = path.join(root, "output");
        const run = (command, role = "holder") => {
            writeFileSync(output, "");
            const result = spawnSync(
                process.execPath,
                [
                    path.join(root, "scripts/actions-acceptance.mjs"),
                    command,
                    role,
                    scenario,
                ],
                {
                    cwd: root,
                    encoding: "utf8",
                    env: {
                        ...process.env,
                        GITHUB_SHA: "a".repeat(40),
                        GITHUB_REPOSITORY: "devegoma/blog",
                        GITHUB_RUN_ID: "123",
                        GITHUB_RUN_ATTEMPT: "1",
                        GITHUB_OUTPUT: output,
                        GITHUB_STEP_SUMMARY: path.join(root, "summary"),
                    },
                },
            );
            assert.equal(result.status, 0, result.stderr + result.stdout);
            return readFileSync(output, "utf8");
        };
        const proofPath = (role) =>
            path.join(
                root,
                `test-results/actions-acceptance/${role}-${scenario}/proof.json`,
            );
        run("init");
        assert.equal(run("guard"), "publish=true\n");
        run("publish-start");
        const holder = JSON.parse(readFileSync(proofPath("holder")));
        holder.queuedCandidate = {
            id: 1,
            status: "queued",
            observedAt: new Date().toISOString(),
        };
        writeFileSync(proofPath("holder"), JSON.stringify(holder));
        run("update-main", scenario);
        run("publish-end");
        run("init", "candidate");
        assert.equal(
            run("guard", "candidate"),
            `publish=${scenario === "serialize"}\n`,
        );
        if (scenario === "serialize") run("publish-once", "candidate");
        if (scenario === "stale")
            assert.equal(run("old-target", "candidate"), "publish=false\n");
        const candidate = JSON.parse(readFileSync(proofPath("candidate")));
        assert.equal(
            candidate.publicationCalls,
            scenario === "serialize" ? 1 : 0,
        );
        if (scenario === "stale")
            assert.equal(candidate.oldCommitRerun.publicationCalls, 0);
    });
}
