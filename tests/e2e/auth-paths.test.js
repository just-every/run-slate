import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackHostname, safeAppPath } from "../../src/core/platform/auth/paths.ts";

test("local development eligibility is loopback-only", () => {
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("::1"), true);
  assert.equal(isLoopbackHostname(new URL("http://[::1]:3000").hostname), true);
  assert.equal(isLoopbackHostname("slate.example"), false);
});

test("next paths remain inside the operator app and keep their query", () => {
  assert.equal(safeAppPath("/app/containers/x?tab=1"), "/app/containers/x?tab=1");
  assert.equal(safeAppPath("/app?tab=1"), "/app?tab=1");
  assert.equal(safeAppPath("/app"), "/app");
  assert.equal(safeAppPath("/app/"), "/app/");
  assert.equal(safeAppPath("/setup?source=owner"), "/setup?source=owner");
  assert.equal(safeAppPath("/setup/other"), "/app");
  assert.equal(safeAppPath("/setup/../app"), "/app");
  assert.equal(safeAppPath("//attacker.example/setup"), "/app");
  assert.equal(safeAppPath("https://attacker.example/app"), "/app");
  assert.equal(safeAppPath("//attacker.example/app"), "/app");
  assert.equal(safeAppPath("/appointments?tab=1"), "/app");
  assert.equal(safeAppPath("/signin"), "/app");
  assert.equal(safeAppPath(undefined), "/app");
});
