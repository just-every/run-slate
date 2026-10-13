import { createRequire } from 'node:module';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productionModules } from '@runeditrun/rer/production-modules';

// Use the same Wrangler conversion and module loader as Base productionRuntime,
// with the qualification's isolated configuration, bindings and persistence.
const [configPath, persistPath, port, varsPath] = process.argv.slice(2);
const require = createRequire(await realpath(resolve('node_modules/wrangler/package.json')));
const { unstable_getMiniflareWorkerOptions, unstable_readConfig } = require('wrangler');
const miniflare = require('miniflare');
const config = unstable_readConfig({ config: configPath });
const selected = unstable_getMiniflareWorkerOptions(config);
const { modulesRules, ...workerOptions } = selected.workerOptions;
const worker = { ...workerOptions, name: config.name,
  ...await productionModules(selected.main, modulesRules, miniflare),
  bindings: { ...workerOptions.bindings, ...JSON.parse(await readFile(varsPath, 'utf8')) } };
const options = miniflare.convertV4MiniflareOptions({ host: '127.0.0.1', port: Number(port),
  unsafeTriggerHandlers: false, unsafeLocalExplorer: false, workers: [worker, ...selected.externalWorkers] });
const runtime = new miniflare.Miniflare({ ...options, resourcePersistencePath: resolve(persistPath, 'v3') });
let stopping;
const stop = () => stopping ??= runtime.dispose();
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
try { await runtime.ready; }
catch (cause) { await stop(); throw cause; }
