import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = 'worker-configuration.d.ts';
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) throw new Error('Usage: cf-typegen.mjs [--check]');
const output = path.join(root, `.worker-configuration-${randomUUID()}.d.ts`);
try {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'types', output,
    '--config=wrangler.jsonc', '--env-interface=SlateWorkerBindings', '--include-runtime=false',
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } });
  if (result.error || result.status !== 0) throw new Error('Wrangler binding generation failed.');
  // Only the invocation comment contains the temporary destination; declarations stay verbatim.
  const generated = (await fs.readFile(output, 'utf8')).replace(output, target);
  if (check) {
    const current = await fs.readFile(path.join(root, target), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    if (generated !== current) throw new Error('Stale worker-configuration.d.ts; run pnpm run cf-typegen and review the generated bindings.');
    console.log('Worker binding declarations are current.');
  } else {
    await fs.writeFile(path.join(root, target), generated);
    console.log('Generated worker-configuration.d.ts.');
  }
} finally {
  await fs.rm(output, { force: true });
}
