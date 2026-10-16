import {readFile, writeFile} from 'node:fs/promises';
import {withSlateExport} from './delivery/slate-spec.mjs';
import {deploymentSpec} from './delivery/base/spec.mjs';
import {sha256} from './build/source-identity.mjs';
export async function integrationRecipe(root, write = false) {
  const config = JSON.parse(await readFile(new URL('./delivery/base/packaging.json', import.meta.url)));
  const spec = withSlateExport(await deploymentSpec(root, config.artifact.specInputs));
  const sourceFiles = ['scripts/delivery/slate-spec.mjs', 'scripts/build-delivery-artifact.mjs', 'scripts/delivery/base/packaging.json', 'src/server.ts', 'src/core/features/workspace/bootstrap.ts', 'src/core/platform/config/runtime.ts', ...spec.migrations.map(row => `migrations/core/${row.name}`)];
  const provenance = {schema: 1, sourceRepository: 'just-every/run-slate', sourceFiles: Object.fromEntries(await Promise.all(sourceFiles.map(async name => [name, `sha256:${sha256(await readFile(`${root}/${name}`))}`])))};
  for (const [name, value] of [['deployment-spec.json', spec], ['source-provenance.json', provenance]]) {
    const bytes = JSON.stringify(value, null, 2) + '\n', file = `${root}/management/integration/${name}`;
    if (write) await writeFile(file, bytes);
    else if (await readFile(file, 'utf8') !== bytes) throw Error(`Stale integration ${name}; intentionally regenerate with pnpm integration:sync`);
  }
  return spec;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  if (process.argv.length > 3 || !['--check', '--write'].includes(process.argv[2])) throw Error('Use --check or --write');
  await integrationRecipe(process.cwd(), process.argv[2] === '--write');
  console.log('Integration resource, migration and source identities match.');
}
