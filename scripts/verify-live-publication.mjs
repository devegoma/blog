import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyPublication(manifest, project, run) {
    assert.equal(run.event, "push");
    assert.equal(run.head_branch, "main");
    assert.equal(run.status, "completed");
    assert.equal(run.conclusion, "success");
    assert.equal(manifest.repository, "devegoma/blog");
    assert.equal(manifest.commit, run.head_sha);
    assert.equal(manifest.runId, String(run.id));
    assert.equal(manifest.runAttempt, String(run.run_attempt));
    assert.equal(project.name, "blog");
    assert.equal(project.productionBranch, "main");
    assert.equal(project.subdomain, "blog-5w4.pages.dev");
    assert.equal(project.deployment.commit, manifest.commit);
    assert.equal(project.deployment.branch, "main");
    assert.equal(project.deployment.environment, "production");
    assert.equal(project.deployment.status, "success");
    const deployment = new URL(project.deployment.url);
    assert.equal(deployment.protocol, "https:");
    assert(deployment.hostname.endsWith(`.${project.subdomain}`));
    const origins = [deployment.origin + "/", `https://${project.subdomain}/`];
    const files = [];
    for (const origin of origins) {
        for (const file of manifest.files) {
            assert(!file.path.startsWith("/") && !file.path.includes("\\"));
            assert(
                file.path
                    .split("/")
                    .every((part) => part && part !== "." && part !== ".."),
            );
            const url = new URL(
                file.path.split("/").map(encodeURIComponent).join("/"),
                origin,
            );
            const response = await fetch(url, {
                signal: AbortSignal.timeout(20000),
                redirect: "follow",
            });
            assert(
                file.path === "404.html"
                    ? [200, 404].includes(response.status)
                    : response.status === 200,
                `${url}: unexpected HTTP status`,
            );
            const bytes = Buffer.from(await response.arrayBuffer());
            const sha256 = createHash("sha256").update(bytes).digest("hex");
            assert.equal(bytes.length, file.size, `${url}: size mismatch`);
            assert.equal(sha256, file.sha256, `${url}: artifact mismatch`);
            files.push({
                url: url.href,
                path: file.path,
                status: response.status,
                size: bytes.length,
                sha256,
            });
        }
    }
    const smoke = [];
    for (const pathname of [
        "/",
        "/about/",
        "/tags/",
        "/rss.xml",
        "/sitemap.xml",
        "/images/social-share.png",
        "/posts/sample/",
        "/posts/automation/",
    ]) {
        const response = await fetch(new URL(pathname, origins[1]), {
            signal: AbortSignal.timeout(20000),
        });
        const expected = pathname.startsWith("/posts/") ? 404 : 200;
        assert.equal(
            response.status,
            expected,
            `Production smoke check: ${pathname}`,
        );
        smoke.push({ path: pathname, status: response.status });
    }
    return {
        checkedAt: new Date().toISOString(),
        result: "passed",
        commit: manifest.commit,
        actionsRun: run.html_url,
        runId: run.id,
        runAttempt: run.run_attempt,
        artifactId: run.productionArtifact?.id,
        artifactDigest: run.productionArtifact?.digest,
        deploymentId: project.deployment.id,
        deploymentUrl: project.deployment.url,
        productionUrl: origins[1],
        inspectedFiles: manifest.files.length,
        checkedResponses: files.length,
        files,
        smoke,
    };
}

async function main() {
    const [bundle, projectFile, runFile, output] = process.argv.slice(2);
    assert(
        bundle && projectFile && runFile && output,
        "Usage: verify-live-publication.mjs <bundle> <project.json> <run.json> <output.json>",
    );
    const manifest = JSON.parse(
        readFileSync(path.join(bundle, "manifest.json"), "utf8"),
    );
    const project = JSON.parse(readFileSync(projectFile, "utf8"));
    const run = JSON.parse(readFileSync(runFile, "utf8"));
    execFileSync(
        process.execPath,
        [
            fileURLToPath(new URL("./ci-artifact.mjs", import.meta.url)),
            "verify",
            bundle,
        ],
        {
            stdio: "inherit",
            env: {
                ...process.env,
                GITHUB_REPOSITORY: "devegoma/blog",
                GITHUB_SHA: run.head_sha,
                GITHUB_RUN_ID: String(run.id),
                GITHUB_RUN_ATTEMPT: String(run.run_attempt),
                GITHUB_STEP_SUMMARY: "",
            },
        },
    );
    const report = await verifyPublication(manifest, project, run);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 4) + "\n");
    console.log(
        JSON.stringify(
            {
                result: report.result,
                commit: report.commit,
                actionsRun: report.actionsRun,
                artifactId: report.artifactId,
                deploymentId: report.deploymentId,
                productionUrl: report.productionUrl,
                inspectedFiles: report.inspectedFiles,
                checkedResponses: report.checkedResponses,
                smoke: report.smoke,
            },
            null,
            2,
        ),
    );
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
    await main();
