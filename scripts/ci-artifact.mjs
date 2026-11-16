import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
    appendFile,
    cp,
    mkdir,
    readdir,
    readFile,
    writeFile,
} from "node:fs/promises";
import path from "node:path";

function provenance() {
    const {
        GITHUB_SHA: commit,
        GITHUB_RUN_ID: runId,
        GITHUB_RUN_ATTEMPT: runAttempt,
        GITHUB_REPOSITORY: repository,
    } = process.env;
    assert.match(commit ?? "", /^[a-f0-9]{40}$/);
    assert.match(runId ?? "", /^\d+$/);
    assert.match(runAttempt ?? "", /^\d+$/);
    assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/);
    return { commit, repository, runId, runAttempt };
}

async function inventory(directory, prefix = "") {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const name = prefix + entry.name;
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await inventory(filename, name + "/")));
        } else {
            assert(entry.isFile(), `Unsupported artifact entry: ${name}`);
            const bytes = await readFile(filename);
            files.push({
                path: name,
                size: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
            });
        }
    }
    return files.sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
}

const [mode, first, second] = process.argv.slice(2);
assert(
    mode === "pack" || mode === "verify",
    "Usage: ci-artifact.mjs pack <dist> <bundle> | verify <bundle>",
);
const source = provenance();
const bundle = mode === "pack" ? second : first;
assert(bundle, "Artifact bundle directory is required");
const directory = path.join(bundle, "dist");
if (mode === "pack") {
    assert(first, "Production directory is required");
    const files = await inventory(first);
    assert(
        files.some((file) => file.path === "index.html"),
        "Missing production index.html",
    );
    await mkdir(bundle);
    await cp(first, directory, { recursive: true });
    assert.deepEqual(
        await inventory(directory),
        files,
        "Production artifact changed while packaging",
    );
    await writeFile(
        path.join(bundle, "manifest.json"),
        JSON.stringify({ version: 1, ...source, files }, null, 2) + "\n",
    );
}
assert.deepEqual(
    (await readdir(bundle)).sort(),
    ["dist", "manifest.json"],
    "Unexpected artifact bundle entries",
);
const manifest = JSON.parse(
    await readFile(path.join(bundle, "manifest.json"), "utf8"),
);
const files = await inventory(directory);
assert(
    files.some((file) => file.path === "index.html"),
    "Missing production index.html",
);
assert.deepEqual(
    manifest,
    { version: 1, ...source, files },
    "Artifact contents or provenance mismatch",
);
const summary = `Verified production artifact: ${source.repository}@${source.commit}, run ${source.runId}, attempt ${source.runAttempt}, ${files.length} files.\n`;
console.log(summary.trim());
if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
