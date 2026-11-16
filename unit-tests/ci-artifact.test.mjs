import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(
    new URL("../scripts/ci-artifact.mjs", import.meta.url),
);
const source = {
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REPOSITORY: "devegoma/blog",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
};

function fixture(t) {
    const root = mkdtempSync(path.join(tmpdir(), "ci-artifact-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const dist = path.join(root, "dist");
    const bundle = path.join(root, "release");
    mkdirSync(path.join(dist, ".well-known"), { recursive: true });
    writeFileSync(path.join(dist, "index.html"), "<html>production</html>");
    writeFileSync(path.join(dist, ".well-known", "test"), "hidden asset");
    return { root, dist, bundle };
}

function run(args, env = {}) {
    return spawnSync(process.execPath, [cli, ...args], {
        encoding: "utf8",
        env: { ...process.env, ...source, GITHUB_STEP_SUMMARY: "", ...env },
    });
}

test("packs and verifies exact production bytes, hidden assets and provenance", (t) => {
    const { dist, bundle } = fixture(t);
    assert.equal(run(["pack", dist, bundle]).status, 0);
    const manifest = JSON.parse(
        readFileSync(path.join(bundle, "manifest.json")),
    );
    assert.equal(manifest.commit, source.GITHUB_SHA);
    assert.equal(manifest.runId, "123");
    assert.equal(manifest.files.length, 2);
    assert.equal(
        readFileSync(path.join(bundle, "dist/.well-known/test"), "utf8"),
        "hidden asset",
    );
    assert.equal(run(["verify", bundle]).status, 0);
    assert.notEqual(
        run(["pack", dist, bundle]).status,
        0,
        "must not merge stale bundles",
    );
});

for (const change of [
    "modify",
    "remove",
    "add",
    "commit",
    "run",
    "attempt",
    "repository",
    "manifest",
    "bundle-extra",
]) {
    test(`rejects ${change} after artifact transfer`, (t) => {
        const { dist, bundle } = fixture(t);
        assert.equal(run(["pack", dist, bundle]).status, 0);
        const env = {};
        if (change === "modify")
            writeFileSync(path.join(bundle, "dist/index.html"), "changed");
        if (change === "remove") rmSync(path.join(bundle, "dist/index.html"));
        if (change === "add")
            writeFileSync(path.join(bundle, "dist/uninspected.txt"), "extra");
        if (change === "commit") env.GITHUB_SHA = "b".repeat(40);
        if (change === "run") env.GITHUB_RUN_ID = "456";
        if (change === "attempt") env.GITHUB_RUN_ATTEMPT = "2";
        if (change === "repository") env.GITHUB_REPOSITORY = "other/blog";
        if (change === "manifest") rmSync(path.join(bundle, "manifest.json"));
        if (change === "bundle-extra") {
            mkdirSync(path.join(bundle, "functions"));
            writeFileSync(
                path.join(bundle, "functions/uninspected.js"),
                "export {};",
            );
        }
        assert.notEqual(run(["verify", bundle], env).status, 0);
    });
}

test("rejects empty provenance and a missing production homepage", (t) => {
    const { dist, bundle } = fixture(t);
    assert.notEqual(run(["pack", dist, bundle], { GITHUB_SHA: "" }).status, 0);
    rmSync(path.join(dist, "index.html"));
    assert.notEqual(run(["pack", dist, bundle]).status, 0);
});
