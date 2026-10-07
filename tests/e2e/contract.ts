import { test, type TestFunction } from "vitest";

/**
 * Contract tagging for the Workers-runtime suite.
 *
 * Every test name carries its clause ID so `scripts/verify.mjs` can map Vitest's
 * JSON results back to `CONTRACT.md` and report each clause as satisfied,
 * planned, overridden or broken. The two name shapes are the whole protocol:
 *
 *   `PAGE-001 — what a page is`              a clause journey
 *   `LIFE-006 [draft-then-publish] — …`      one policy-value journey
 *
 * Keep the em dash and the bracket: `scripts/verify.mjs` parses exactly this.
 * `BASE-` IDs belong to BASELINE.md and are reported separately from the
 * product contract.
 *
 * Two rules keep the report honest, and neither is optional:
 *   - a call with no body registers a todo, never a passing test;
 *   - `expect.requireAssertions` in `vitest.config.ts` fails a journey that
 *     asserts nothing, so an empty body cannot satisfy a clause either.
 */

export const CLAUSE_ID_PATTERN = /^((?:BASE-)?[A-Z]+-\d{3})(?:\s+\[([^\]]+)\])?\s+—\s+(.*)$/;

const CLAUSE_ID = /^(?:BASE-)?[A-Z]+-\d{3}$/;

function clauseName(id: string, name: string): string {
  return `${id} — ${name}`;
}

function profileName(id: string, value: string, name: string): string {
  return `${id} [${value}] — ${name}`;
}

function assertClauseId(id: string): void {
  if (!CLAUSE_ID.test(id)) throw new Error(`Not a contract clause ID: ${id}`);
}

function assertPolicyValue(value: string): void {
  if (!value.trim() || value.includes("]")) throw new Error(`Not a policy value: ${value}`);
}

interface ContractProfile {
  /**
   * Registers one journey for a single value of a policy clause's policy. A
   * policy clause counts satisfied only once every value in that policy's
   * definition has a passing journey. Omitting the body registers a todo.
   */
  (id: string, value: string, body?: TestFunction): void;
  (id: string, value: string, name: string, body?: TestFunction): void;
  /** Registers a policy-value journey the seed has not written yet. */
  todo(id: string, value: string, name?: string): void;
}

interface Contract {
  /** Registers a journey that satisfies one contract clause. */
  (id: string, name: string, body: TestFunction): void;
  /** Without a body the clause is planned, not satisfied. */
  (id: string, name: string): void;
  /** Registers a clause the seed has not implemented yet. Reported as planned. */
  todo(id: string, name: string): void;
  profile: ContractProfile;
}

function register(id: string, name: string, body?: TestFunction): void {
  assertClauseId(id);
  if (!body) {
    test.todo(clauseName(id, name));
    return;
  }
  test(clauseName(id, name), body);
}

const profile = ((id: string, value: string, nameOrBody?: string | TestFunction, maybeBody?: TestFunction): void => {
  assertClauseId(id);
  assertPolicyValue(value);
  const name = typeof nameOrBody === "string" ? nameOrBody : value;
  const body = typeof nameOrBody === "string" ? maybeBody : nameOrBody;
  if (!body) {
    test.todo(profileName(id, value, name));
    return;
  }
  test(profileName(id, value, name), body);
}) as ContractProfile;

profile.todo = (id: string, value: string, name = value): void => {
  assertClauseId(id);
  assertPolicyValue(value);
  test.todo(profileName(id, value, name));
};

export const contract = register as Contract;

contract.todo = (id: string, name: string): void => {
  assertClauseId(id);
  test.todo(clauseName(id, name));
};

contract.profile = profile;
