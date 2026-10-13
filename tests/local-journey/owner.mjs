import assert from 'node:assert/strict';
export async function assertOneOwner(run) {
  const output = await run('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', '--local', '--persist-to', '.wrangler/state', '--config', 'wrangler.jsonc', '--command', "SELECT (SELECT count(*) FROM workspaces) AS workspaces, (SELECT count(*) FROM members WHERE role='owner') AS owners", '--json']);
  const result = JSON.parse(output);
  assert.ok(Array.isArray(result) && result.every(row => row.success), 'D1 owner inventory succeeds');
  assert.deepEqual(result.flatMap(row => row.results), [{ workspaces: 1, owners: 1 }], 'one native workspace and owner persist');
}
