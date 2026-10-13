import { mkdtemp, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, delimiter } from 'node:path';
export const repository = fileURLToPath(new URL('../../', import.meta.url));
export async function fixture(t, source = '') {
  const root = await mkdtemp(fileURLToPath(new URL('../../../installer-test-', import.meta.url)));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(repository, 'rer-setup.json'), join(root, 'rer-setup.json'));
  const bin = join(root, 'bin'); await mkdir(bin);
  await writeFile(join(bin, 'pnpm'), `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
  return { root, env: { ...process.env, PATH: bin + delimiter + process.env.PATH } };
}
