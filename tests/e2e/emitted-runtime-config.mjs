import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Keep Wrangler's runtime scratch beside the test state, outside build inputs. */
export async function emittedRuntimeConfig(root, state) {
  const source = resolve(root, 'dist/server');
  const config = JSON.parse(await readFile(resolve(source, 'wrangler.json'), 'utf8'));
  const path = value => resolve(source, value);
  config.main = path(config.main);
  config.base_dir = path(config.base_dir ?? '.');
  if (config.assets?.directory) config.assets.directory = path(config.assets.directory);
  if (config.tsconfig) config.tsconfig = path(config.tsconfig);
  if (config.build?.cwd) config.build.cwd = path(config.build.cwd);
  for (const database of config.d1_databases ?? []) {
    if (database.migrations_dir) database.migrations_dir = path(database.migrations_dir);
  }
  for (const key of ['wasm_modules', 'text_blobs', 'data_blobs']) {
    if (config[key]) config[key] = Object.fromEntries(Object.entries(config[key]).map(([name, file]) => [name, path(file)]));
  }
  const directory = resolve(state, 'runtime-config');
  await mkdir(directory, { recursive: true });
  const file = resolve(directory, 'wrangler.json');
  await writeFile(file, JSON.stringify(config));
  return file;
}
