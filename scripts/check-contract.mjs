import {retiredRuntimeFindings} from './retired-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Structural checks only: behavioural acceptance belongs to Slate's CI. */
export async function inspectContract(root = process.cwd()) {
  const checks = [];
  const check = (name, passed, details = {}) => checks.push({name, status: passed ? 'passed' : 'failed', ...details});
  const read = relativePath => fs.readFile(path.join(root, relativePath), 'utf8');
  async function readJsonIfPresent(relativePath) {
    try { return JSON.parse(await read(relativePath)); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
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

  const [contract, baseline, manifestText, policySource] = await Promise.all([
    read("CONTRACT.md"),
    read("BASELINE.md"),
    read("seed.json"),
    read("src/core/shared/knowledge/policies.ts"),
  ]);

  const manifest = JSON.parse(manifestText);
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

  const unknownOverrides = [...overriddenIds].filter((id) => !contractIds.includes(id) && !baselineIds.includes(id));
  check("contract clause IDs are unique", new Set(contractIds).size === contractIds.length, { clauseCount: contractIds.length });
  check("baseline clause IDs are unique", baselineIds.length > 0 && new Set(baselineIds).size === baselineIds.length, { clauseCount: baselineIds.length });
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
  return {checks, contract, baseline, clauses, contractIds, baselineIds, policyDefinitions, overriddenIds};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {checks} = await inspectContract();
  console.log(JSON.stringify({checks}, null, 2));
  if (checks.some(({status}) => status === 'failed')) process.exitCode = 1;
}
