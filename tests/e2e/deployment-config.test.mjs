import assert from "node:assert/strict";
import test from "node:test";
import { deploymentCachePath, deploymentNames, readDeploymentInput, renderWranglerConfig } from "../../scripts/deployment.mjs";

test("deployment names are deterministic and environment scoped", () => {
  assert.deepEqual(deploymentNames("preview"), {
    environment: "preview",
    worker: "slate-preview",
    database: "slate-preview-db",
    files: "slate-preview-files",
    jobs: "slate-preview-jobs",
  });
  assert.equal(deploymentCachePath("/repo", "preview"), "/repo/.seed/deployment/preview.json");
  assert.throws(() => deploymentNames("Preview"), /lower-case/);
});

test("deployment input uses declared defaults and validates conditional inputs", () => {
  const environment = {
    SLATE_DEPLOY_ENV: "preview",
    SLATE_APP_URL: "https://preview.example.com",
    SLATE_SETUP_OWNER_EMAIL: "owner@example.com",
    SLATE_MAIL_FROM: "Slate <mail@example.com>",
  };
  const input = readDeploymentInput(environment);
  assert.equal(input.publicPageHost, "preview.example.com");
  assert.equal(input.linkPreviewsEnabled, "true");
  assert.equal(input.aiEnabled, "false");
  assert.throws(() => readDeploymentInput({ ...environment, SLATE_SSO_ENABLED: "true" }), /SLATE_IDENTITY_ISSUER_URL/);
});

test("generated Wrangler config replaces every token without embedding secrets", () => {
  const input = readDeploymentInput({
    SLATE_DEPLOY_ENV: "preview",
    SLATE_APP_URL: "https://preview.example.com",
    SLATE_SETUP_OWNER_EMAIL: "owner@example.com",
    SLATE_MAIL_FROM: "Slate <mail@example.com>",
  });
  const config = renderWranglerConfig('name = "__WORKER_NAME__"\ndatabase_id = "__DATABASE_ID__"\nmail = "__MAIL_FROM__"', input, "db-id");
  assert.equal(config, 'name = "slate-preview"\ndatabase_id = "db-id"\nmail = "Slate <mail@example.com>"');
  assert.doesNotMatch(config, /MAIL_API_KEY|SESSION_SECRET/);
});
