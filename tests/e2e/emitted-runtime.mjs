import { createRequire } from 'node:module';
import { readFile, realpath, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { productionModules } from '@runeditrun/rer/production-modules';

// Use the same Wrangler conversion and module loader as Base productionRuntime,
// with the qualification's isolated configuration, bindings and persistence.
const [configPath, persistPath, port, varsPath, triggerMode] = process.argv.slice(2);
const require = createRequire(await realpath(resolve('node_modules/wrangler/package.json')));
const { unstable_getMiniflareWorkerOptions, unstable_readConfig } = require('wrangler');
const miniflare = require('miniflare');
const config = unstable_readConfig({ config: configPath });
const selected = unstable_getMiniflareWorkerOptions(config);
const { modulesRules, ...workerOptions } = selected.workerOptions;
const mailbox = resolve('.artifacts/mail-edge', port + '.jsonl');
await mkdir(resolve('.artifacts/mail-edge'), {recursive:true});
await writeFile(mailbox, '');
const vars = {...workerOptions.bindings, ...JSON.parse(await readFile(varsPath, 'utf8'))};
const mail = vars.MAIL_PROVIDER === 'development' ? {MAIL_PROVIDER:'resend',MAIL_API_KEY:'test-only-mail-key'} : {};
const worker = { ...workerOptions, name: config.name,
  ...await productionModules(selected.main, modulesRules, miniflare),
  bindings: { ...workerOptions.bindings, ...vars, ...mail },
  outboundService: async request => {
    if (request.url === 'https://api.resend.com/emails') {
      const message = await request.json();
      await appendFile(mailbox, JSON.stringify(message) + '\n');
      return new miniflare.Response(JSON.stringify({id:crypto.randomUUID()}), {headers:{'content-type':'application/json'}});
    }
    return fetch(request);
  } };
const options = miniflare.convertV4MiniflareOptions({ host: '127.0.0.1', port: Number(port),
  unsafeTriggerHandlers: triggerMode === 'scheduled', unsafeLocalExplorer: false, workers: [worker, ...selected.externalWorkers] });
const runtime = new miniflare.Miniflare({ ...options, resourcePersistencePath: resolve(persistPath, 'v3') });
let stopping;
const stop = () => stopping ??= runtime.dispose();
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
try { await runtime.ready; }
catch (cause) { await stop(); throw cause; }
