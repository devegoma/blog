import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { verifyPublication } from "../scripts/verify-live-publication.mjs";

function fixture(t, corrupt = false) {
    const bytes = Buffer.from("acceptance publication bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const commit = "a".repeat(40);
    const manifest = {
        repository: "devegoma/blog",
        commit,
        runId: "123",
        runAttempt: "1",
        files: [{ path: "index.html", size: bytes.length, sha256 }],
    };
    const project = {
        name: "blog",
        productionBranch: "main",
        subdomain: "blog-5w4.pages.dev",
        deployment: {
            id: "deployment-id",
            commit,
            branch: "main",
            environment: "production",
            status: "success",
            url: "https://abc.blog-5w4.pages.dev",
        },
    };
    const run = {
        id: 123,
        run_attempt: 1,
        head_sha: commit,
        head_branch: "main",
        event: "push",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/devegoma/blog/actions/runs/123",
        productionArtifact: { id: 456, digest: "sha256:artifact" },
    };
    t.mock.method(
        globalThis,
        "fetch",
        async (url) =>
            new Response(corrupt ? "changed after inspection" : bytes, {
                status:
                    new URL(url).pathname.startsWith("/posts/") ||
                    new URL(url).pathname === "/404.html"
                        ? 404
                        : 200,
            }),
    );
    return { manifest, project, run };
}
test("live publication links commit, run, artifact and deployment while checking bytes", async (t) => {
    const { manifest, project, run } = fixture(t);
    const report = await verifyPublication(manifest, project, run);
    assert.equal(report.result, "passed");
    assert.equal(report.commit, run.head_sha);
    assert.equal(report.artifactId, 456);
    assert.equal(report.deploymentId, "deployment-id");
    assert.equal(report.checkedResponses, 2);
    assert(
        report.smoke
            .filter((entry) => entry.path.startsWith("/posts/"))
            .every((entry) => entry.status === 404),
    );
});
test("live publication rejects files differing from inspected artifact", async (t) => {
    const { manifest, project, run } = fixture(t, true);
    await assert.rejects(verifyPublication(manifest, project, run), /mismatch/);
});
test("live publication accepts the inspected 404 document served with HTTP 404", async (t) => {
    const { manifest, project, run } = fixture(t);
    manifest.files.push({ ...manifest.files[0], path: "404.html" });
    const report = await verifyPublication(manifest, project, run);
    assert(
        report.files
            .filter((file) => file.path === "404.html")
            .every((file) => file.status === 404),
    );
});
test("live publication rejects a successful deployment of another commit", async (t) => {
    const { manifest, project, run } = fixture(t);
    project.deployment.commit = "b".repeat(40);
    await assert.rejects(verifyPublication(manifest, project, run));
});
test("live publication rejects PR checks as evidence of production publication", async (t) => {
    const { manifest, project, run } = fixture(t);
    run.event = "pull_request";
    await assert.rejects(verifyPublication(manifest, project, run));
});
