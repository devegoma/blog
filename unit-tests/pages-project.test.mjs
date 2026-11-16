import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectProject } from "../scripts/check-pages-project.mjs";

const project = {
    name: "blog",
    production_branch: "main",
    subdomain: "blog-example.pages.dev",
    source: {
        type: "github",
        config: {
            owner: "devegoma",
            repo_name: "blog",
            production_deployments_enabled: false,
            preview_deployment_setting: "none",
        },
    },
    deployment_configs: {
        production: {
            env_vars: { PRIVATE_VALUE: { value: "DO_NOT_DISCLOSE" } },
        },
    },
    canonical_deployment: {
        id: "deployment-id",
        environment: "production",
        deployment_trigger: {
            metadata: { commit_hash: "a".repeat(40), branch: "main" },
        },
        latest_stage: { status: "success" },
        url: "https://abc.blog-example.pages.dev",
        env_vars: { SECRET: "DO_NOT_DISCLOSE" },
    },
};
test("Pages preflight returns only allowlisted project/deployment evidence", () => {
    const report = inspectProject(project);
    assert.equal(report.project, "blog");
    assert.equal(report.productionBranch, "main");
    assert.equal(report.registeredSecretsAuthorizedForProject, true);
    assert.equal(report.canonicalDeployment.commit, "a".repeat(40));
    assert(!JSON.stringify(report).includes("DO_NOT_DISCLOSE"));
    assert(!("deployment_configs" in report));
});
test("Pages preflight accepts Direct Upload with no Git integration", () => {
    const report = inspectProject({
        ...project,
        source: null,
        canonical_deployment: null,
    });
    assert.equal(report.source.type, "direct-upload");
    assert.equal(report.canonicalDeployment, null);
});
for (const field of [
    "project",
    "branch",
    "owner",
    "repository",
    "production-auto",
    "preview-auto",
]) {
    test(`Pages preflight rejects unexpected ${field}`, () => {
        const changed = structuredClone(project);
        if (field === "project") changed.name = "other";
        if (field === "branch") changed.production_branch = "develop";
        if (field === "owner") changed.source.config.owner = "other";
        if (field === "repository") changed.source.config.repo_name = "other";
        if (field === "production-auto")
            changed.source.config.production_deployments_enabled = true;
        if (field === "preview-auto")
            changed.source.config.preview_deployment_setting = "all";
        assert.throws(() => inspectProject(changed));
    });
}
