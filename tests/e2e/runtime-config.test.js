import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeConfig, RuntimeConfigurationError } from "../../src/core/platform/config/runtime.ts";

test("local sample mode requires the explicit flag and a loopback host", () => {
  const config = readRuntimeConfig({ LOCAL_SAMPLE_DATA: "true", SESSION_SECRET: "local-development-secret" }, true);
  assert.equal(config.localSampleData, true);
  assert.equal(config.sessionSecret, "local-development-secret");
  assert.throws(
    () => readRuntimeConfig({ LOCAL_SAMPLE_DATA: "true", SESSION_SECRET: "local-development-secret" }, false),
    (cause) => cause instanceof RuntimeConfigurationError && cause.message.includes("APP_URL"),
  );
});

test("a session secret is required in local sample mode too", () => {
  assert.throws(
    () => readRuntimeConfig({ LOCAL_SAMPLE_DATA: "true" }, true),
    (cause) => cause instanceof RuntimeConfigurationError && cause.message.includes("SESSION_SECRET"),
  );
});

test("deployment mode names every missing required variable", () => {
  assert.throws(
    () => readRuntimeConfig({}, false),
    (cause) => cause instanceof RuntimeConfigurationError
      && cause.message.includes("APP_URL")
      && cause.message.includes("SETUP_OWNER_EMAIL")
      && cause.message.includes("SESSION_SECRET")
      && cause.message.includes("MAIL_FROM")
      && cause.message.includes("MAIL_API_KEY"),
  );
});
