// Type surface for `tests/e2e/contract.js` while the shared Vitest-in-workerd
// helper (`tests/e2e/contract.ts`) is still landing. Delete this file when that
// helper arrives; the call shape is identical, so tests move with a one-line
// import change.
export function contract(id: string, name: string, fn?: () => void | Promise<void>): unknown;
