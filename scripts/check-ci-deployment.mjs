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
import { data, Evaluator, Lexer, Parser } from "@actions/expressions";
import { parse } from "yaml";

const project = fileURLToPath(new URL("../", import.meta.url));
const workflow = parse(
    readFileSync(path.join(project, ".github/workflows/ci.yml"), "utf8"),
);
const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const artifactName = "Store verified production artifact";
const publishName = "Publish verified production artifact";
const commit = "a".repeat(40);

function expressionData(value) {
    if (typeof value === "boolean") return new data.BooleanData(value);
    if (typeof value === "string") return new data.StringData(value);
    return new data.Dictionary(
        ...Object.entries(value).map(([key, value]) => ({
            key,
            value: expressionData(value),
        })),
    );
}

function evaluate(expression, context, failed = false) {
    const functions = ["success", "failure"].map((name) => ({
        name,
        minArgs: 0,
        maxArgs: 0,
        call: () => new data.BooleanData(name === "failure" ? failed : !failed),
    }));
    const tokens = new Lexer(
        expression.replace(/^\$\{\{\s*|\s*\}\}$/g, ""),
    ).lex().tokens;
    const ast = new Parser(tokens, Object.keys(context), functions).parse();
    return new Evaluator(
        ast,
        expressionData(context),
        new Map(functions.map((fn) => [fn.name, fn])),
    ).evaluate();
}

function interpolate(value, context) {
    return value.replace(/\$\{\{(.*?)\}\}/g, (_, expression) =>
        evaluate(expression, context).coerceString(),
    );
}

function scenario({
    event = "push",
    ref = "refs/heads/main",
    enabled = true,
    failAt,
    corrupt = false,
    checksResult,
} = {}) {
    const root = mkdtempSync(path.join(tmpdir(), "ci-workflow-"));
    const calls = [];
    const contexts = {
        github: {
            event_name: event,
            ref,
            sha: commit,
            run_id: "123",
            run_attempt: "1",
        },
        needs: {},
        secrets: {
            CLOUDFLARE_API_TOKEN: "isolated-token",
            CLOUDFLARE_ACCOUNT_ID: "isolated-account",
        },
    };
    const env = {
        ...process.env,
        GITHUB_SHA: commit,
        GITHUB_REPOSITORY: "devegoma/blog",
        GITHUB_RUN_ID: "123",
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_STEP_SUMMARY: path.join(root, "summary"),
        CI_TEST_NODE: process.execPath.replaceAll("\\", "/"),
        CI_TEST_LOG: path.join(root, "calls.jsonl"),
        CI_TEST_STUB: path.join(root, "stub.mjs").replaceAll("\\", "/"),
    };
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    writeFileSync(env.CI_TEST_LOG, "");
    writeFileSync(
        path.join(bin, "pnpm"),
        '#!/usr/bin/env bash\nexec "$CI_TEST_NODE" "$CI_TEST_STUB" "$@"\n',
        { mode: 0o755 },
    );
    env.PATH =
        bin +
        path.delimiter +
        path.dirname(process.execPath) +
        path.delimiter +
        process.env.PATH;
    writeFileSync(
        path.join(root, "stub.mjs"),
        `
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.CI_TEST_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\\n');
if ('pnpm ' + args.join(' ') === process.env.CI_TEST_FAIL) process.exit(1);
if (args.join(' ') === 'test') {
    mkdirSync('dist/.well-known', { recursive: true });
    writeFileSync('dist/index.html', '<html>inspected production</html>');
    writeFileSync('dist/.well-known/test', 'hidden');
    mkdirSync('dist-verification', { recursive: true });
    writeFileSync('dist-verification/index.html', 'sample must not deploy');
}
if (args[0] === 'dlx') {
    if (process.env.CLOUDFLARE_API_TOKEN !== 'isolated-token') process.exit(1);
    if (process.env.CLOUDFLARE_ACCOUNT_ID !== 'isolated-account') process.exit(1);
    if (readFileSync('dist/index.html', 'utf8') !== '<html>inspected production</html>') process.exit(1);
}
`,
    );
    try {
        let stored = false;
        let failed = false;
        let deployment = "skipped";
        for (const jobName of ["checks", "deploy"]) {
            const job = workflow.jobs[jobName];
            if (jobName === "deploy") {
                contexts.needs.checks = {
                    result: checksResult ?? (failed ? "failure" : "success"),
                    outputs: { "production-artifact-id": stored ? "42" : "" },
                };
                const condition = enabled
                    ? job.if.replace("false && ", "")
                    : job.if;
                if (!evaluate(condition, contexts).value) break;
                failed = false;
                deployment = "success";
            }
            const workspace = path.join(root, jobName);
            mkdirSync(path.join(workspace, "scripts"), { recursive: true });
            cpSync(
                path.join(project, "scripts/ci-artifact.mjs"),
                path.join(workspace, "scripts/ci-artifact.mjs"),
            );
            for (const step of job.steps) {
                if (
                    step.if
                        ? !evaluate(step.if, contexts, failed).value
                        : failed
                )
                    continue;
                assert(
                    !step["continue-on-error"],
                    "A required step must not continue on failure",
                );
                const label = step.name ?? step.run ?? step.uses;
                calls.push(label);
                if (label === failAt && !step.run) {
                    failed = true;
                    continue;
                }
                if (step.run) {
                    const stepEnv = Object.fromEntries(
                        Object.entries(step.env ?? {}).map(([key, value]) => [
                            key,
                            interpolate(value, contexts),
                        ]),
                    );
                    if (label === failAt) {
                        stepEnv.CI_TEST_FAIL = step.run;
                        if (step.run.startsWith("node "))
                            stepEnv.GITHUB_SHA = "";
                    }
                    const result = spawnSync(
                        bash,
                        [
                            "--noprofile",
                            "--norc",
                            "-eo",
                            "pipefail",
                            "-c",
                            interpolate(step.run, contexts),
                        ],
                        {
                            cwd: path.join(
                                workspace,
                                step["working-directory"] ?? ".",
                            ),
                            env: { ...env, ...stepEnv },
                            encoding: "utf8",
                        },
                    );
                    assert(!result.error, result.error?.message);
                    if (result.status !== 0) {
                        assert(
                            label === failAt ||
                                (corrupt && jobName === "deploy"),
                            result.stderr || result.stdout,
                        );
                        failed = true;
                    }
                } else if (
                    step.uses.startsWith("actions/upload-artifact@") &&
                    label === artifactName
                ) {
                    cpSync(
                        path.join(workspace, step.with.path),
                        path.join(root, "stored"),
                        { recursive: true },
                    );
                    stored = true;
                } else if (step.uses.startsWith("actions/download-artifact@")) {
                    assert.equal(
                        interpolate(step.with["artifact-ids"], contexts),
                        "42",
                    );
                    assert(stored, "No verified artifact is available");
                    cpSync(
                        path.join(root, "stored"),
                        path.join(workspace, step.with.path),
                        { recursive: true },
                    );
                    if (corrupt)
                        writeFileSync(
                            path.join(
                                workspace,
                                step.with.path,
                                "dist/index.html",
                            ),
                            "changed during transfer",
                        );
                } else {
                    assert(
                        [
                            "actions/checkout@",
                            "pnpm/action-setup@",
                            "actions/setup-node@",
                            "actions/upload-artifact@",
                        ].some((action) => step.uses.startsWith(action)),
                        `Unmodeled action: ${step.uses}`,
                    );
                }
            }
            if (jobName === "deploy" && failed) deployment = "failure";
        }
        const log = readFileSync(env.CI_TEST_LOG, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line));
        return {
            calls,
            stored,
            deployment,
            published: log.filter((call) => call.args[0] === "dlx"),
        };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

assert.deepEqual(workflow.on.push.branches, ["main", "develop"]);
assert.deepEqual(workflow.on.pull_request.branches, ["main", "develop"]);
assert.equal(workflow.jobs.deploy.needs, "checks");
assert.match(workflow.jobs.deploy.if, /^\$\{\{ false && /);
const upload = workflow.jobs.checks.steps.find(
    (step) => step.name === artifactName,
);
assert.equal(upload.with["retention-days"], 7);
assert.equal(upload.with["include-hidden-files"], true);
assert.equal(upload.with["if-no-files-found"], "error");
assert.equal(
    workflow.jobs.checks.outputs["production-artifact-id"],
    `\u0024{{ steps.${upload.id}.outputs.artifact-id }}`,
);
assert.equal(workflow.permissions.contents, "read");
assert.deepEqual(Object.keys(workflow.jobs), ["checks", "deploy"]);
const publish = workflow.jobs.deploy.steps.find(
    (step) => step.name === publishName,
);
assert.match(publish.run, /^pnpm dlx wrangler@4\.135\.0 pages deploy dist /);
assert.match(
    publish.run,
    /--project-name blog --branch main --commit-hash "\$GITHUB_SHA"/,
);
assert.equal(publish["working-directory"], "release");
assert.deepEqual(Object.keys(publish.env), [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "WRANGLER_SEND_METRICS",
]);
for (const [jobName, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps) {
        if (step !== publish)
            assert(!JSON.stringify(step).includes("secrets."));
        if (jobName === "deploy" && step.run)
            assert(!/install|build|astro/.test(step.run));
    }
}

let cases = 0;
function check(options, expected) {
    const result = scenario(options);
    assert.equal(result.published.length, expected, JSON.stringify(options));
    cases++;
    return result;
}

for (const options of [
    {},
    { ref: "refs/heads/develop" },
    { event: "pull_request", ref: "refs/pull/68/merge" },
    { event: "workflow_dispatch" },
])
    check({ ...options, enabled: false }, 0);
const success = check({}, 1);
assert(success.stored);
assert.equal(success.deployment, "success");
assert.deepEqual(success.published[0].args, [
    "dlx",
    "wrangler@4.135.0",
    "pages",
    "deploy",
    "dist",
    "--project-name",
    "blog",
    "--branch",
    "main",
    "--commit-hash",
    commit,
    "--commit-dirty=false",
    "--no-bundle",
]);
for (const options of [
    { ref: "refs/heads/develop" },
    { event: "pull_request", ref: "refs/pull/68/merge" },
    { event: "pull_request" },
    { event: "workflow_dispatch" },
    { event: "workflow_call" },
    { event: "push", ref: "refs/tags/test" },
])
    check(options, 0);
for (const failAt of [
    "pnpm install --frozen-lockfile",
    "pnpm lint",
    "pnpm format:check",
    "pnpm check",
    "pnpm exec playwright install --with-deps chromium firefox",
    "pnpm test",
    "Inspect final production artifact",
    "Package verified production artifact",
    artifactName,
]) {
    const result = check({ failAt }, 0);
    assert.equal(result.stored, false);
}
for (const checksResult of ["failure", "cancelled", "skipped"])
    check({ checksResult }, 0);
const corrupt = check({ corrupt: true }, 0);
assert.equal(corrupt.deployment, "failure");
assert(!corrupt.calls.includes(publishName));
console.log(
    `CI deployment: ${cases} isolated scenarios passed; no external deployment was performed.`,
);
