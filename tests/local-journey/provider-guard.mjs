import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
// Deny discovery/auth/provider commands at the global PATH boundary. Real
// pnpm exec resolves the scratch project's local Wrangler for D1 migrations.
export async function denyProviderCommands(directory, path = process.env.PATH) {
  const bin = join(directory, 'provider-denial');
  await mkdir(bin, { recursive: true, mode: 0o700 });
  const trace = join(bin, 'denied.jsonl'); await writeFile(trace, '', { mode: 0o600 });
  for (const tool of ['gh', 'wrangler']) {
    const file = join(bin, tool);
    const line = JSON.stringify({ command: tool, denied: true });
    await writeFile(file, `#!/bin/sh\nprintf '%s\\n' '${line}' >> '${trace.replaceAll("'", "'\\''")}'\necho 'Provider commands are disabled in this local proof.' >&2\nexit 77\n`);
    await chmod(file, 0o700);
  }
  return { PATH: `${bin}:${path}`, trace, async assertDenied() {
    const rows = (await readFile(trace, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(rows.length > 0, 'provider discovery reached local denial boundary');
    assert.ok(rows.every(row => ['gh', 'wrangler'].includes(row.command) && row.denied === true), 'no provider command was forwarded');
    return rows;
  } };
}
