import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { workflow } from "./check-ci-deployment.mjs";
import { createRemote, git } from "../unit-tests/helpers/ci-git.mjs";

const runner = fileURLToPath(
    new URL("./check-ci-deployment.mjs", import.meta.url),
);

// Model GitHub's one-running/one-pending queue; runtime exclusion is supplied by Actions.
function deploymentQueue() {
    const config = workflow.jobs.deploy.concurrency;
    assert.equal(config.group, "pages-blog-production");
    assert.equal(config["cancel-in-progress"], false);
    assert(!config.queue || config.queue === "single");
    let active = false;
    let pending;
    function launch(job) {
        active = true;
        execFile(
            process.execPath,
            [runner, "--scenario", JSON.stringify(job.options)],
            { timeout: 30000, encoding: "utf8" },
            (error, stdout, stderr) => {
                active = false;
                if (error) job.reject(new Error(stderr || error.message));
                else {
                    try {
                        job.resolve(JSON.parse(stdout));
                    } catch (error) {
                        job.reject(error);
                    }
                }
                if (pending) {
                    const next = pending;
                    pending = undefined;
                    launch(next);
                }
            },
        );
    }
    return (options) =>
        new Promise((resolve, reject) => {
            const job = { options, resolve, reject };
            if (!active) launch(job);
            else {
                if (pending)
                    pending.resolve({ cancelled: true, published: [] });
                pending = job;
            }
        });
}

async function waitForFile(filename) {
    const deadline = Date.now() + 15000;
    while (!existsSync(filename)) {
        assert(Date.now() < deadline, "First publication did not start");
        await setTimeout(20);
    }
}

for (const mode of [
    "serialize",
    "main-updated-while-waiting",
    "replace-pending",
    "main-unavailable-after-waiting",
]) {
    const root = mkdtempSync(path.join(tmpdir(), "ci-order-"));
    const hold = path.join(root, "hold");
    try {
        const {
            remote,
            commits: [a, b, c],
        } = createRemote(root);
        const publishLog = path.join(root, "publications.jsonl");
        writeFileSync(publishLog, "");
        writeFileSync(hold, "hold");
        const entered = path.join(root, "entered");
        const enqueue = deploymentQueue();
        const first = enqueue({ remote, target: a, hold, entered, publishLog });
        await waitForFile(entered);
        git(["-C", remote, "update-ref", "refs/heads/main", b]);
        const second = enqueue({ remote, target: b, publishLog });
        let third;
        if (
            mode === "main-updated-while-waiting" ||
            mode === "replace-pending"
        ) {
            git(["-C", remote, "update-ref", "refs/heads/main", c]);
            if (mode === "replace-pending")
                third = enqueue({ remote, target: c, publishLog });
        }
        if (mode === "main-unavailable-after-waiting")
            git(["-C", remote, "update-ref", "-d", "refs/heads/main"]);
        rmSync(hold);
        const [firstResult, secondResult, thirdResult] = await Promise.all([
            first,
            second,
            third,
        ]);
        assert.equal(
            firstResult.published.length,
            1,
            "An active publication must not be cancelled",
        );
        if (mode === "serialize")
            assert.equal(secondResult.published.length, 1);
        else assert.equal(secondResult.published.length, 0);
        if (mode === "replace-pending") {
            assert(secondResult.cancelled);
            assert.equal(thirdResult.published.length, 1);
        } else if (mode !== "serialize") {
            const decision = secondResult.decisions.join("");
            assert(decision.includes(`target=${b}`));
            assert(decision.includes("decision=skip"));
            assert(
                decision.includes(
                    mode === "main-updated-while-waiting"
                        ? `latest-main=${c}`
                        : "reason=main-unavailable",
                ),
            );
        }
        const events = readFileSync(publishLog, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        let active = 0;
        for (const event of events) {
            active += event.event === "start" ? 1 : -1;
            assert(active >= 0 && active <= 1, "Publications overlapped");
        }
        assert.equal(active, 0);
        assert.equal(
            events.length,
            mode === "serialize" || mode === "replace-pending" ? 4 : 2,
        );
        if (mode === "main-updated-while-waiting") {
            const rerun = await enqueue({ remote, target: a, publishLog });
            assert.equal(rerun.published.length, 0);
            assert(rerun.decisions.join("").includes("reason=stale-commit"));
            assert.equal(
                readFileSync(publishLog, "utf8").trim().split("\n").length,
                2,
            );
        }
        console.log(`CI publication order: ${mode} passed.`);
    } finally {
        if (existsSync(hold)) rmSync(hold);
        rmSync(root, { recursive: true, force: true });
    }
}
console.log(
    "CI publication order: 4 queue scenarios and an old-commit rerun passed; no external deployment was performed.",
);
