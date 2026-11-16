import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function inspectProject(project) {
    assert.equal(project.name, "blog", "Unexpected Pages project");
    assert.equal(
        project.production_branch ?? project.source?.config?.production_branch,
        "main",
        "Unexpected production branch",
    );
    const source = project.source;
    if (source) {
        assert.equal(source.type, "github", "Unexpected Git integration");
        assert.equal(
            source.config.owner,
            "devegoma",
            "Unexpected repository owner",
        );
        assert.equal(source.config.repo_name, "blog", "Unexpected repository");
        assert.equal(
            source.config.production_deployments_enabled,
            false,
            "Pages production Git auto-deployment must remain disabled",
        );
        assert.equal(
            source.config.preview_deployment_setting,
            "none",
            "Pages preview Git auto-deployment must remain disabled",
        );
    }
    assert.match(project.subdomain ?? "", /^[a-z0-9.-]+\.pages\.dev$/);
    const deployment = project.canonical_deployment;
    return {
        project: project.name,
        productionBranch: "main",
        subdomain: project.subdomain,
        source: source
            ? {
                  type: source.type,
                  repository: `${source.config.owner}/${source.config.repo_name}`,
              }
            : { type: "direct-upload" },
        pagesGitProductionAutoDeployDisabled: true,
        pagesGitPreviewAutoDeployDisabled: true,
        registeredSecretsAuthorizedForProject: true,
        canonicalDeployment: deployment
            ? {
                  id: deployment.id,
                  environment: deployment.environment,
                  commit: deployment.deployment_trigger?.metadata?.commit_hash,
                  branch: deployment.deployment_trigger?.metadata?.branch,
                  status: deployment.latest_stage?.status,
                  url: deployment.url,
              }
            : null,
    };
}

async function requestPages(suffix = "") {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    assert(token && account, "Registered Cloudflare Secrets are missing");
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/blog${suffix}`,
        {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(30000),
        },
    );
    assert(response.ok, `Pages read request failed: HTTP ${response.status}`);
    const body = await response.json();
    assert.equal(body.success, true, "Pages read request was not successful");
    return body.result;
}

async function main() {
    const report = {
        checkedAt: new Date().toISOString(),
        repository: process.env.GITHUB_REPOSITORY,
        workflowCommit: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT,
        ...inspectProject(await requestPages()),
    };
    const directory = "test-results";
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        path.join(directory, "issue70-project.json"),
        JSON.stringify(report, null, 2) + "\n",
    );
    console.log(JSON.stringify(report, null, 2));
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
    await main();
