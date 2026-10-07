import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {sha256} from '../../scripts/release/deployment-spec.mjs';

const safe = name => typeof name === 'string' && name && !name.startsWith('/') && !name.includes('\\') && !name.split('/').some(part => !part || part === '.' || part === '..');
export async function materializeArtifact(root, output) {
  const bytes = await readFile(resolve(root, 'delivery-artifact/slate-worker-artifact.json'));
  const bundle = JSON.parse(bytes);
  assert.equal(bundle.schema, 1); assert.equal(bundle.deploymentSpec.schema, 1);
  assert(bundle.modules.some(row => row.name === bundle.mainModule));
  const destinations = new Set();
  async function put(name, content) {
    assert(safe(name), 'Unsafe artifact path'); assert(!destinations.has(name), 'Duplicate artifact path'); destinations.add(name);
    const target = resolve(output, name); await mkdir(dirname(target), {recursive: true}); await writeFile(target, content, {flag: 'wx'});
  }
  for (const row of bundle.modules) {
    assert(['esm', 'commonjs', 'compiled-wasm', 'text', 'buffer'].includes(row.type));
    assert(safe(row.name)); await put(`server/${row.name}`, Buffer.from(row.contentBase64, 'base64'));
  }
  for (const row of bundle.assets) {
    assert(row.path.startsWith('/') && safe(row.path.slice(1)));
    await put(`client${row.path}`, Buffer.from(row.contentBase64, 'base64'));
  }
  for (const row of bundle.deploymentSpec.migrations) {
    assert.equal(row.binding, 'DB'); assert.equal(sha256(Buffer.from(row.sql)), row.sha256);
    await put(`migrations/${row.name}`, row.sql);
  }
  const spec = bundle.deploymentSpec;
  // Local provider identities only; runtime code, assets and migrations came
  // exclusively from the packaged bytes, never a source or dist fallback.
  const config = {
    name: 'slate-delivery-test', main: resolve(output, 'server', bundle.mainModule), no_bundle: true,
    compatibility_date: spec.compatibilityDate, compatibility_flags: spec.compatibilityFlags,
    assets: {directory: resolve(output, 'client')},
    rules: Object.entries({esm: 'ESModule', commonjs: 'CommonJS', text: 'Text', buffer: 'Data', 'compiled-wasm': 'CompiledWasm'}).flatMap(([type, rule]) => {const globs = bundle.modules.filter(row => row.type === type).map(row => row.name); return globs.length ? [{type: rule, globs}] : []; }),
    d1_databases: spec.resources.filter(r => r.kind === 'd1').map(r => ({binding: r.binding, database_name: 'delivery-test-db', database_id: '00000000-0000-0000-0000-000000000000', migrations_dir: resolve(output, 'migrations')})),
    r2_buckets: spec.resources.filter(r => r.kind === 'r2').map(r => ({binding: r.binding, bucket_name: 'delivery-test-files'})),
    queues: {producers: spec.resources.filter(r => r.kind === 'queue').map(r => ({binding: r.binding, queue: 'delivery-test-jobs'})), consumers: spec.queueConsumers.map(r => ({queue: 'delivery-test-jobs', max_batch_size: r.maxBatchSize, max_batch_timeout: r.maxBatchTimeout, max_retries: r.maxRetries}))},
    durable_objects: {bindings: spec.durableObjects.map(r => ({name: r.binding, class_name: r.className}))},
    migrations: spec.durableObjectMigrations.map(r => ({tag: r.tag, new_sqlite_classes: r.newSqliteClasses})),
    triggers: {crons: spec.schedules},
  };
  return {bundle, config, artifactSha256: sha256(bytes)};
}
