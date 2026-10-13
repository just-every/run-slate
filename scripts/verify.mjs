import {retiredRuntimeFindings} from './retired-runtime.mjs';
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import {validateEvidenceRegistry,taggedTestInventory} from "./evidence-registry.mjs";

const root = process.cwd();
const resultsPath = ".artifacts/contract-results.json";
const checks = [];

function check(name, passed, details = {}) {
  checks.push({ name, status: passed ? "passed" : "failed", ...details });
}

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

async function readJsonIfPresent(relativePath) {
  try {
    return JSON.parse(await read(relativePath));
  } catch (cause) {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  }
}

/** Splits CONTRACT.md into `{ id, body }` in document order. */
function readClauses(markdown) {
  const clauses = [];
  const pattern = /\*\*([A-Z]+-\d{3}) —/g;
  let match;
  while ((match = pattern.exec(markdown))) {
    const next = /\*\*[A-Z]+-\d{3} —/g;
    next.lastIndex = match.index + match[0].length;
    const end = next.exec(markdown)?.index ?? markdown.length;
    clauses.push({ id: match[1], body: markdown.slice(match.index, end) });
  }
  return clauses;
}

/**
 * The eight policies are declared once, in `src/core/shared/knowledge/policies.ts`.
 * `seed.json` lists their IDs; the values live with the code that enforces them.
 */
function readPolicyDefinitions(source) {
  const definitions = new Map();
  const pattern = /id:\s*"([^"]+)",\s*default:\s*"([^"]+)",\s*values:\s*\[([^\]]+)\]/g;
  let match;
  while ((match = pattern.exec(source))) {
    const values = [...match[3].matchAll(/"([^"]+)"/g)].map((value) => value[1]);
    definitions.set(match[1], { default: match[2], values });
  }
  return definitions;
}

/**
 * Runs the Workers-runtime contract suite. The previous report is deleted
 * first, so a suite that crashes before writing leaves nothing to misread as
 * this run's result.
 */
async function runWorkersContractSuite() {
  await fs.rm(path.join(root, resultsPath), { force: true });
  const result = spawnSync(
    process.execPath,
    ["./node_modules/vitest/vitest.mjs", "run", "--reporter=default", "--reporter=json", `--outputFile=${resultsPath}`],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.error) throw result.error;
  return result.status;
}

/** A unique report path prevents an earlier artifact run from satisfying access. */
async function runArtifactAccessSuite() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "slate-access-"));
  const reportPath = path.join(directory, "report.json");
  try {
    const result = spawnSync(process.execPath, ["--test", "tests/e2e/production-artifact.test.mjs"], {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, SLATE_ACCESS_REPORT_PATH: reportPath },
    });
    if (result.error) throw result.error;
    let report;
    try {
      report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    } catch (cause) {
      if (cause.code !== "ENOENT" && !(cause instanceof SyntaxError)) throw cause;
    }
    const cases = report?.cases;
    const passed = result.status === 0 && report?.clause === "BASE-ACCESS-002"
      && report.status === "satisfied" && Array.isArray(cases)
      && ["missing", "expired", "revoked", "valid"].every((name) => cases.some((entry) => entry.name === name && entry.status === "passed"))
      && cases.every((entry) => entry.status === "passed");
    return { passed, exitCode: result.status, cases: cases ?? [] };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

/** `PAGE-001 — …` and `LIFE-006 [draft-then-publish] — …`; see tests/e2e/contract.ts. */
const TEST_NAME = /^((?:BASE-)?[A-Z]+-\d{3})(?:\s+\[([^\]]+)\])?\s+—\s+/;

/**
 * `tests/e2e/setup/` holds the suite's own harness — the fixtures and their
 * self-tests. They assert nothing about the product, so they map to no clause
 * and are not counted as untagged journeys. They are still run and must still
 * pass: a failure there fails the suite like any other.
 */
const HARNESS_DIR = `${path.sep}tests${path.sep}e2e${path.sep}setup${path.sep}`;

// Parser regressions prove normalization details, not complete persisted import journeys.
// Keep this allowlist explicit so future import journeys must carry clause tags.
const PARSER_REGRESSIONS = new Set([
  "parsers", "archive-safety", "mapping-regressions", "real-exports", "inflate-bounds",
].map((name) => path.join(root, "tests/e2e/imports", `${name}.test.ts`)));

function readTaggedResults(report, evidence) {
  const tagged = new Map();
  const untagged = [];
  const harnessTagged = [];
  let harness = 0;
  let parserRegressions = 0;
  const parserTagged = [];
  for (const file of report.testResults ?? []) {
    const isHarness = (file.name ?? "").includes(HARNESS_DIR);
    for (const assertion of file.assertionResults ?? []) {
      const name = assertion.fullName ?? assertion.title ?? "";
      const match = TEST_NAME.exec(name);
      if (PARSER_REGRESSIONS.has(file.name ?? "")) {
        parserRegressions += 1;
        if (match) parserTagged.push(name);
        continue;
      }
      if (isHarness) {
        harness += 1;
        // A clause is satisfied by a product journey, never by the harness.
        if (match) harnessTagged.push(name);
        continue;
      }
      if (evidence?.isSupporting(file.name, name)) continue;
      if (!match) {
        untagged.push(name);
        continue;
      }
      const [, id, profile] = match;
      if (!tagged.has(id)) tagged.set(id, []);
      tagged.get(id).push({ profile, status: assertion.status, name });
    }
  }
  return { tagged, untagged, harness, harnessTagged, parserRegressions, parserTagged };
}

/**
 * A clause is broken if any tagged test failed, satisfied if it has a passing
 * journey — and for a policy clause, a passing journey for every value of its
 * policy — and planned otherwise. Buyer overrides win over everything.
 */
function classifyClause({ id, policy, results, overridden }) {
  if (overridden) return { id, state: "overridden", policy };
  const runs = results ?? [];
  if (runs.some(({ status }) => status === "failed")) {
    return { id, state: "broken", policy, failed: runs.filter(({ status }) => status === "failed").map(({ name }) => name) };
  }
  if (!policy) {
    return { id, state: runs.some(({ status }) => status === "passed") ? "satisfied" : "planned" };
  }
  const covered = new Set(runs.filter(({ status, profile }) => status === "passed" && profile).map(({ profile }) => profile));
  const missing = policy.values.filter((value) => !covered.has(value));
  if (missing.length) return { id, state: "planned", policy: policy.id, missingProfiles: missing };
  return { id, state: "satisfied", policy: policy.id };
}

function tally(clauses) {
  const counts = { satisfied: 0, planned: 0, overridden: 0, broken: 0 };
  for (const { state } of clauses) counts[state] += 1;
  return counts;
}

const [contract, baseline, manifestText, packageText, policySource] = await Promise.all([
  read("CONTRACT.md"),
  read("BASELINE.md"),
  read("seed.json"),
  read("package.json"),
  read("src/core/shared/knowledge/policies.ts"),
]);

const manifest = JSON.parse(manifestText);
const packageManifest = JSON.parse(packageText);
const clauses = readClauses(contract);
const contractIds = clauses.map(({ id }) => id);
const baselineIds = [...baseline.matchAll(/\*\*(BASE-[A-Z]+-\d{3}) —/g)].map((match) => match[1]);
const capabilityIds = new Set(manifest.capabilities.flatMap(({ clauses: mapped }) => mapped));
const contractPolicies = [...contract.matchAll(/Policy: `([^`]+)`/g)].map((match) => match[1]);
const manifestPolicies = new Set(manifest.extensionPoints.policies);
const policyDefinitions = readPolicyDefinitions(policySource);

// `src/ext/contract-overrides.json` is buyer-owned and usually absent. It lists
// the clause IDs this deployment deliberately replaces with its own tests.
const overridesFile = await readJsonIfPresent("src/ext/contract-overrides.json");
const overriddenIds = new Set(Array.isArray(overridesFile) ? overridesFile : Object.keys(overridesFile ?? {}));

const artifactAccess = await runArtifactAccessSuite();
const suiteStatus = await runWorkersContractSuite();
const report = await readJsonIfPresent(resultsPath);

/**
 * A run that did not complete cannot say anything about clause behaviour. A
 * partial report — one test file crashed, the rest wrote results — would make
 * its clauses look merely planned, so nothing is classified at all until the
 * suite exits clean.
 */
const suiteCompleted = suiteStatus === 0 && Boolean(report);
const suiteFailure = !report
  ? `The Workers contract suite wrote no report to ${resultsPath}.`
  : suiteStatus !== 0
    ? `The Workers contract suite exited ${suiteStatus}; its report cannot be trusted to be complete.`
    : undefined;

const evidence = validateEvidenceRegistry({root, report: report ?? {}, registry: await readJsonIfPresent("tests/requirements/test-evidence.json") ?? {}, inventory: await readJsonIfPresent("tests/requirements/clause-inventory.json") ?? {}, documents: {"CONTRACT.md": contract, "BASELINE.md": baseline}});
const { tagged, untagged, harness, harnessTagged, parserRegressions, parserTagged } = report
  ? readTaggedResults(report, evidence)
  : { tagged: new Map(), untagged: [], harness: 0, harnessTagged: [], parserRegressions: 0, parserTagged: [] };

tagged.set("BASE-ACCESS-002", [
  ...(tagged.get("BASE-ACCESS-002") ?? []),
  { status: artifactAccess.passed ? "passed" : "failed", name: "BASE-ACCESS-002 — emitted Worker session access matrix" },
]);

const productClauses = suiteCompleted
  ? clauses.map(({ id, body }) => {
      const policyId = /Policy: `([^`]+)`/.exec(body)?.[1];
      const definition = policyId ? policyDefinitions.get(policyId) : undefined;
      return classifyClause({
        id,
        policy: definition ? { id: policyId, values: definition.values } : undefined,
        results: tagged.get(id),
        overridden: overriddenIds.has(id),
      });
    })
  : [];
const baselineClauses = suiteCompleted
  ? baselineIds.map((id) => classifyClause({ id, results: tagged.get(id), overridden: overriddenIds.has(id) }))
  : [];

const productCounts = suiteCompleted ? tally(productClauses) : { state: "unknown", reason: suiteFailure };
const baselineCounts = suiteCompleted ? tally(baselineClauses) : { state: "unknown", reason: suiteFailure };
const unknownTags = [...tagged.keys()].filter((id) => !contractIds.includes(id) && !baselineIds.includes(id));
const unknownOverrides = [...overriddenIds].filter((id) => !contractIds.includes(id) && !baselineIds.includes(id));
const failedTests = report
  ? (report.testResults ?? []).flatMap((file) => (file.assertionResults ?? []).filter(({ status }) => status === "failed").map(({ fullName, title }) => fullName ?? title))
  : [];

check("emitted Worker access matrix completed", artifactAccess.passed, artifactAccess);
check("contract clause IDs are unique", new Set(contractIds).size === contractIds.length, { clauseCount: contractIds.length });
check("baseline clause IDs are unique", baselineIds.length > 0 && new Set(baselineIds).size === baselineIds.length, { clauseCount: baselineIds.length });
check("the Workers contract suite completed", suiteCompleted, { exitCode: suiteStatus, reason: suiteFailure, failedTests });
check("evidence metadata is exact and current", suiteCompleted && evidence.errors.length === 0, {errors: evidence.errors, supportingTests: evidence.registered.size});
const rawTagged=taggedTestInventory(report??{});
check("every contract clause has a tagged test", suiteCompleted && contractIds.every((id) => rawTagged.has(id) || overriddenIds.has(id)), {
  clauseCount: contractIds.length,
  untagged: contractIds.filter((id) => !rawTagged.has(id) && !overriddenIds.has(id)),
  reason: suiteFailure,
});
check("no test tags an unknown clause", suiteCompleted && unknownTags.length === 0 && untagged.length === 0, { unknownTags, untaggedTests: untagged, reason: suiteFailure });
check("the test harness claims no clause", suiteCompleted && harnessTagged.length === 0, { harnessTests: harness, harnessTagged, reason: suiteFailure });
check("parser regressions claim no complete clause", suiteCompleted && parserTagged.length === 0, { parserRegressions, parserTagged, reason: suiteFailure });
check("no contract clause is broken", suiteCompleted && productCounts.broken === 0, {
  broken: productClauses.filter(({ state }) => state === "broken"),
  reason: suiteFailure,
});
check("every contract override names a real clause", unknownOverrides.length === 0, { unknownOverrides, overrideCount: overriddenIds.size });
check("manifest exactly maps contract clauses", contractIds.every((id) => capabilityIds.has(id)) && [...capabilityIds].every((id) => contractIds.includes(id)), { clauseCount: contractIds.length, mappedCount: capabilityIds.size });
check("contract and manifest policies match", contractPolicies.every((id) => manifestPolicies.has(id)) && [...manifestPolicies].every((id) => contractPolicies.includes(id)), { contractPolicies, manifestPolicies: [...manifestPolicies] });
check("every declared policy has a definition with values", [...manifestPolicies].every((id) => (policyDefinitions.get(id)?.values.length ?? 0) >= 2), {
  policies: Object.fromEntries([...policyDefinitions].map(([id, definition]) => [id, definition.values])),
});
check("contract IDs do not collide with baseline suffixes", contractIds.every((id) => !baselineIds.some((baselineId) => baselineId.endsWith(id))));
const retiredFindings = await retiredRuntimeFindings(root);
check("retired runtimes have been removed", retiredFindings.length === 0, {findings: retiredFindings});
check("operator and public paths follow the seed URL convention", manifest.deploy.operatorPath === "/app" && ["/", "/signin", "/health", "/api/auth/", "/assets/"].every((path) => manifest.deploy.publicPaths.includes(path)) && manifest.deploy.publicPaths.every((path) => path === "/" || path.startsWith("/")))

const result = {
  product: "Slate",
  checkedAt: new Date().toISOString(),
  foundation: "worker-d1-tanstack-start",
  passed: checks.filter(({ status }) => status === "passed").length,
  failed: checks.filter(({ status }) => status === "failed").length,
  productContractBehavior: productCounts,
  baselineContractBehavior: baselineCounts,
  baselineClauses,
  clauseEvidenceInventory: [...evidence.records.values()],
  ...(suiteCompleted
    ? {
        brokenClauses: productClauses.filter(({ state }) => state === "broken"),
        satisfiedClauses: productClauses.filter(({ state }) => state === "satisfied").map(({ id }) => id),
        policyClauses: productClauses.filter(({ policy }) => policy),
      }
    : { suiteFailure, failedTests }),
  checks,
};

console.log(JSON.stringify(result, null, 2));
if (result.failed) process.exitCode = 1;
