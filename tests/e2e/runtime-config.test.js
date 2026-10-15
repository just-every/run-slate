import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeConfig, RuntimeConfigurationError } from "../../src/core/platform/config/runtime.ts";
const local = {LOCAL_DEVELOPMENT:'true', APP_URL:'http://127.0.0.1:4312',SETUP_OWNER_EMAIL:'owner@example.com',SESSION_SECRET:'synthetic-local-development-secret',MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'};

test("local development requires an explicit flag and exact loopback configured origin and request", () => {
  const config = readRuntimeConfig(local, true);
  assert.equal(config.localDevelopment, true);
  assert.equal(config.sessionSecret, "synthetic-local-development-secret");
  assert.equal(config.mailProvider, 'development');
  assert.equal(config.appUrl, 'http://127.0.0.1:4312');
  for (const APP_URL of ['https://hosted.example.com','http://127.0.0.1:4312/path','http://127.0.0.1:4312/','http://user@127.0.0.1:4312','http://127.0.0.1:4312?x=1']) assert.throws(() => readRuntimeConfig({...local,APP_URL},true), /LOCAL_DEVELOPMENT/);
  assert.throws(() => readRuntimeConfig(local, false), /LOCAL_DEVELOPMENT/);
  assert.throws(() => readRuntimeConfig({...local, LOCAL_DEVELOPMENT:undefined}, true), /MAIL_PROVIDER/);
});

test("a session secret is required in local development too", () => {
  assert.throws(() => readRuntimeConfig({...local,SESSION_SECRET:undefined}, true), cause => cause instanceof RuntimeConfigurationError && cause.message.includes("SESSION_SECRET"));
});

test("deployment mode names every missing required variable", () => {
  assert.throws(() => readRuntimeConfig({}, false), cause => cause instanceof RuntimeConfigurationError && ['APP_URL','SETUP_OWNER_EMAIL','SESSION_SECRET','MAIL_PROVIDER','MAIL_FROM','MAIL_API_KEY'].every(name => cause.message.includes(name)));
});

test("mail provider is explicit and local-codex is limited to the new local mode", () => {
  assert.throws(() => readRuntimeConfig({...local,MAIL_PROVIDER:undefined},true), /MAIL_PROVIDER/);
  const ai = {AI_ENABLED:'true', AI_PROVIDER:'local-codex', AI_LOCAL_URL:'http://127.0.0.1:4100', AI_LOCAL_TOKEN:'test-only-token', AI_MODEL:'test-model'};
  assert.equal(readRuntimeConfig({...local,...ai},true).aiProvider, 'local-codex');
  assert.throws(() => readRuntimeConfig({...local,...ai,AI_LOCAL_URL:'https://example.com'},true), /AI_LOCAL_URL/);
  assert.throws(() => readRuntimeConfig({...local,...ai,LOCAL_DEVELOPMENT:undefined,MAIL_PROVIDER:'resend',MAIL_API_KEY:'test-only-key'},true), /development-only/);
});
