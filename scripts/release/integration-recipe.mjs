import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deploymentSpec, sha256} from './deployment-spec.mjs';
export async function integrationRecipe(root, write = false) {
  const spec = await deploymentSpec(root);
  const sourceFiles = ['deploy/wrangler.template.toml', 'src/server.ts', 'src/core/features/workspace/bootstrap.ts', 'src/core/platform/config/runtime.ts', 'scripts/release/deployment-spec.mjs', ...spec.migrations.map(row => `migrations/core/${row.name}`)];
  const provenance = {schema: 1, sourceRepository: 'just-every/slate', sourceFiles: Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, sha256(await readFile(resolve(root, name)))])))};
  for (const [name, value] of [['deployment-spec.json', spec], ['source-provenance.json', provenance]]) {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    const file = resolve(root, 'management/integration', name);
    if (write) await writeFile(file, bytes);
    else if (await readFile(file, 'utf8') !== bytes) throw Error(`Stale integration ${name}; intentionally regenerate with pnpm integration:sync`);
  }
  return spec;
}
