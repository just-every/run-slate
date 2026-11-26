import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('operation checker rejects missing scripts for pnpm run and pnpm shorthand', async () => {
  const { checkOperationCommands } = await import('../scripts/check-operation-commands.mjs');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'slate-command-check-'));
  try {
    await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.mjs' } }));
    const descriptor = argv => ({ commands: { check: { argv } } });
    assert.equal(checkOperationCommands(directory, descriptor(['pnpm', 'run', 'verify'])), true);
    assert.equal(checkOperationCommands(directory, descriptor(['pnpm', 'verify'])), true);
    assert.throws(() => checkOperationCommands(directory, descriptor(['pnpm', 'run', 'absent'])), /Missing package command/);
    assert.throws(() => checkOperationCommands(directory, descriptor(['pnpm', 'absent'])), /Missing package command/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
