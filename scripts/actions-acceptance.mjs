import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { checkout, createRemote, git } from "../unit-tests/helpers/ci-git.mjs";

const project = path.resolve(import.meta.dirname, "..");
const [command, role, scenario] = process.argv.slice(2);
const cases = ["serialize", "stale", "unavailable"];
const root = (who, name) =>
    path.join(project, "test-results/actions-acceptance", `${who}-${name}`);
const stateRoot = (name) =>
    path.join(project, "test-results/actions-main", name);
const read = (filename) => JSON.parse(readFileSync(filename, "utf8"));
const write = (filename, value) =>
    writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
const now = () => new Date().toISOString();
function state(who, name) {
    return read(path.join(root(who, name), "proof.json"));
}
function save(value) {
    write(path.join(root(value.role, value.scenario), "proof.json"), value);
}
function cli(script, args, cwd, target) {
    const result = execFileSync(
        process.execPath,
        [path.join(project, "scripts", script), ...args],
        {
            cwd,
            encoding: "utf8",
            env: { ...process.env, GITHUB_SHA: target },
        },
    );
    process.stdout.write(result);
    return result;
}

function init(who, name) {
    assert(cases.includes(name));
    const directory = root(who, name);
    mkdirSync(directory, { recursive: true });
    let remote, target, commits, update;
    if (who === "holder") {
        ({ remote, commits } = createRemote(directory));
        target = commits[0];
    } else {
        assert.equal(who, "candidate");
        update = read(path.join(stateRoot(name), "state.json"));
        remote = path.join(directory, "remote.git");
        git([
            "clone",
            "--bare",
            path.join(stateRoot(name), "main.bundle"),
            remote,
        ]);
        commits = update.commits;
        target = commits[1];
        if (update.latest === null)
            git(["-C", remote, "update-ref", "-d", "refs/heads/main"]);
        else
            assert.equal(
                git(["-C", remote, "rev-parse", "refs/heads/main"]),
                update.latest,
            );
    }
    const work = path.join(directory, "work");
    checkout(work, remote);
    const dist = path.join(directory, "dist");
    mkdirSync(dist);
    writeFileSync(
        path.join(dist, "index.html"),
        "<html>isolated acceptance fixture</html>\n",
    );
    const bundle = path.join(directory, "release");
    cli("ci-artifact.mjs", ["pack", dist, bundle], work, target);
    cli("ci-artifact.mjs", ["verify", bundle], work, target);
    save({
        role: who,
        scenario: name,
        workflowCommit: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        target,
        commits,
        remote,
        work,
        update,
        initializedAt: now(),
        publicationCalls: 0,
        artifactManifest: read(path.join(bundle, "manifest.json")),
    });
}

function guard(who, name, old = false) {
    const proof = state(who, name);
    const target = old ? proof.commits[0] : proof.target;
    if (old) {
        const dist = path.join(root(who, name), "dist");
        const bundle = path.join(root(who, name), "old-release");
        cli("ci-artifact.mjs", ["pack", dist, bundle], proof.work, target);
        cli("ci-artifact.mjs", ["verify", bundle], proof.work, target);
    }
    const decision = cli(
        "check-latest-main.mjs",
        [],
        proof.work,
        target,
    ).trim();
    assert(decision.includes(`target=${target}`));
    if (old) {
        assert(decision.includes("decision=skip reason=stale-commit"));
        proof.oldCommitRerun = { target, decision, publicationCalls: 0 };
    } else {
        proof.decision = decision;
        proof.guardAt = now();
        const expected = who === "holder" || name === "serialize";
        assert.equal(decision.includes("decision=publish"), expected);
        if (!expected)
            assert(
                decision.includes(
                    name === "stale"
                        ? "reason=stale-commit"
                        : "reason=main-unavailable",
                ),
            );
    }
    save(proof);
}

function publication(who, name, phase) {
    const proof = state(who, name);
    assert(proof.decision.includes("decision=publish"));
    if (phase === "start" || phase === "once") {
        assert.equal(proof.publicationCalls, 0);
        proof.publicationCalls++;
        proof.publicationStartedAt = now();
    }
    if (phase === "end" || phase === "once") proof.publicationEndedAt = now();
    save(proof);
    console.log(
        `Recording-only publication: ${who}/${name}, phase=${phase}, target=${proof.target}`,
    );
}

async function github(endpoint) {
    assert(process.env.GITHUB_TOKEN, "GitHub Actions token is required");
    const response = await fetch(
        `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/${endpoint}`,
        {
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
            signal: AbortSignal.timeout(20000),
        },
    );
    assert(response.ok, `Actions metadata request failed: ${response.status}`);
    return response.json();
}

async function waitFor(check, label) {
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
        const result = await check();
        if (result) return result;
        await setTimeout(3000);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

async function waitStarted(name) {
    await waitFor(
        async () =>
            (await github("artifacts?per_page=100")).artifacts.find(
                (artifact) => artifact.name === `acceptance-started-${name}`,
            ),
        `holder ${name}`,
    );
    console.log(`Holder marker observed: ${name}`);
}

async function waitCandidate(name) {
    const job = await waitFor(
        async () =>
            (await github("jobs?per_page=100")).jobs.find(
                (job) =>
                    job.name === `Acceptance candidate (${name})` &&
                    ["queued", "pending", "waiting"].includes(job.status),
            ),
        `queued candidate ${name}`,
    );
    const proof = state("holder", name);
    proof.queuedCandidate = {
        id: job.id,
        name: job.name,
        status: job.status,
        observedAt: now(),
    };
    save(proof);
    console.log(
        `Candidate queued while holder owns concurrency group: ${job.id} (${name})`,
    );
}

function updateMain(name) {
    const proof = state("holder", name);
    assert(proof.queuedCandidate);
    const latest =
        name === "serialize"
            ? proof.commits[1]
            : name === "stale"
              ? proof.commits[2]
              : null;
    const destination = stateRoot(name);
    mkdirSync(destination, { recursive: true });
    if (latest)
        git(["-C", proof.remote, "update-ref", "refs/heads/main", latest]);
    git([
        "-C",
        proof.remote,
        "bundle",
        "create",
        path.join(destination, "main.bundle"),
        "refs/heads/main",
    ]);
    if (latest === null)
        git(["-C", proof.remote, "update-ref", "-d", "refs/heads/main"]);
    write(path.join(destination, "state.json"), {
        commits: proof.commits,
        latest,
        updatedAt: now(),
        queuedCandidate: proof.queuedCandidate,
    });
    proof.mainUpdate = read(path.join(destination, "state.json"));
    save(proof);
    console.log(
        `Isolated main updated while candidate queued: ${name}, latest=${latest ?? "unavailable"}`,
    );
}

async function report() {
    const jobs = (await github("jobs?per_page=100")).jobs;
    const results = [];
    for (const name of cases) {
        const holder = read(
            path.join(
                project,
                "test-results/actions-proof",
                `acceptance-holder-${name}`,
                "proof.json",
            ),
        );
        const candidate = read(
            path.join(
                project,
                "test-results/actions-proof",
                `acceptance-candidate-${name}`,
                "proof.json",
            ),
        );
        assert.equal(holder.publicationCalls, 1);
        assert.equal(candidate.publicationCalls, name === "serialize" ? 1 : 0);
        assert(
            Date.parse(holder.publicationEndedAt) <=
                Date.parse(candidate.initializedAt),
        );
        assert(
            Date.parse(holder.queuedCandidate.observedAt) <=
                Date.parse(candidate.update.updatedAt),
        );
        assert(
            Date.parse(candidate.update.updatedAt) <=
                Date.parse(holder.publicationEndedAt),
        );
        if (name === "serialize")
            assert(
                Date.parse(holder.publicationEndedAt) <=
                    Date.parse(candidate.publicationStartedAt),
            );
        if (name === "stale")
            assert.equal(candidate.oldCommitRerun.publicationCalls, 0);
        const holderJob = jobs.find(
            (job) => job.name === `Acceptance holder (${name})`,
        );
        const candidateJob = jobs.find(
            (job) => job.name === `Acceptance candidate (${name})`,
        );
        assert.equal(holderJob.conclusion, "success");
        assert.equal(candidateJob.conclusion, "success");
        assert.equal(
            candidateJob.steps.find(
                (step) => step.name === "Record isolated candidate publication",
            ).conclusion,
            name === "serialize" ? "success" : "skipped",
        );
        assert.equal(
            candidateJob.steps.find(
                (step) =>
                    step.name === "Old target publication must be skipped",
            ).conclusion,
            "skipped",
        );
        assert(
            Date.parse(holderJob.completed_at) <=
                Date.parse(candidateJob.started_at),
        );
        results.push({
            scenario: name,
            holderJobId: holderJob.id,
            candidateJobId: candidateJob.id,
            holderCalls: holder.publicationCalls,
            candidateCalls: candidate.publicationCalls,
            decision: candidate.decision,
            oldCommitRerun: candidate.oldCommitRerun,
            queuedAt: holder.queuedCandidate.observedAt,
            mainUpdatedAt: candidate.update.updatedAt,
            holderEndedAt: holder.publicationEndedAt,
            candidateStartedAt: candidate.initializedAt,
        });
    }
    const result = {
        repository: process.env.GITHUB_REPOSITORY,
        workflowCommit: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        result: "passed",
        cloudflareSecretsUsed: false,
        externalPublicationCalls: 0,
        cases: results,
    };
    const directory = path.join(project, "test-results/actions-report");
    mkdirSync(directory, { recursive: true });
    write(path.join(directory, "acceptance.json"), result);
    console.log(JSON.stringify(result, null, 2));
    appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `## Isolated Actions acceptance passed\n\n${results.map((row) => `- ${row.scenario}: holder=${row.holderCalls}, candidate=${row.candidateCalls}, jobs=${row.holderJobId}/${row.candidateJobId}`).join("\n")}\n\nNo Cloudflare secrets or external publication were used.\n`,
    );
}

async function policy() {
    const { parse } = await import("yaml");
    const production = parse(
        readFileSync(path.join(project, ".github/workflows/ci.yml"), "utf8"),
    );
    const acceptance = parse(
        readFileSync(
            path.join(project, ".github/workflows/issue70-acceptance.yml"),
            "utf8",
        ),
    );
    const failed = parse(
        readFileSync(
            path.join(project, ".github/workflows/issue70-failure.yml"),
            "utf8",
        ),
    );
    const mappedCondition = production.jobs.deploy.if.replace(
        "refs/heads/main",
        "refs/heads/codex/issue-70-acceptance",
    );
    assert.equal(failed.jobs.publish.if, mappedCondition);
    assert.equal(failed.jobs.publish.needs, production.jobs.deploy.needs);
    assert.equal(
        production.jobs.deploy.concurrency["cancel-in-progress"],
        false,
    );
    assert.equal(
        acceptance.jobs.holder.concurrency["cancel-in-progress"],
        production.jobs.deploy.concurrency["cancel-in-progress"],
    );
    assert.deepEqual(
        acceptance.jobs.holder.concurrency,
        acceptance.jobs.candidate.concurrency,
    );
    assert(!JSON.stringify(acceptance).includes("secrets."));
    assert(!JSON.stringify(failed).includes("secrets."));
    console.log(
        `Production gate mapped only to isolated branch; native concurrency retained. CI definition SHA-256=${createHash(
            "sha256",
        )
            .update(
                readFileSync(path.join(project, ".github/workflows/ci.yml")),
            )
            .digest("hex")}`,
    );
}

if (command === "init") init(role, scenario);
else if (command === "guard") guard(role, scenario);
else if (command === "old-target") guard(role, scenario, true);
else if (command === "publish-start") publication(role, scenario, "start");
else if (command === "publish-end") publication(role, scenario, "end");
else if (command === "publish-once") publication(role, scenario, "once");
else if (command === "wait-started") await waitStarted(role);
else if (command === "wait-candidate") await waitCandidate(role);
else if (command === "update-main") updateMain(role);
else if (command === "report") await report();
else if (command === "policy") await policy();
else throw new Error("Unknown acceptance command");
