import { RerError } from '@runeditrun/rer/errors';
// Product bindings and restore policy run in a captured worker; Base owns archives.
async function transfer(context, direction) {
  const { root, path, store, signal, operationToken } = context;
  const [command, args] = (await import('./settings.mjs')).migrationCommand();
  await store.run('Applying local data migrations', command, args, { cwd: root, signal,
    env: { ...process.env, RER_LOCAL_OPERATION: operationToken, WRANGLER_SEND_METRICS: 'false' } });
  const child = store.spawn('Moving Slate installation data', process.execPath,
    ['--import', 'tsx', 'scripts/installer/portability-worker.mjs', direction, path], { cwd: root, signal,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  let output = '';
  child.stdout.on('data', bytes => { output = (output + bytes).slice(-1024 * 1024); });
  const status = await new Promise(resolve => { child.once('error', () => resolve(1)); child.once('close', resolve); });
  await store.stop(child);
  let result; try { result = JSON.parse(output.trim().split('\n').at(-1)); } catch {}
  if (status !== 0 || !result?.ok) throw new RerError(result?.exitCode === 4 ? 'restore_refused' : 'transfer_failed', result?.reason ?? 'Local data transfer failed; inspect the private capture log.', result?.exitCode ?? 1);
  delete result.ok; return { target: 'local', ...result };
}
export const portability = { export: context => transfer(context, 'export'), import: context => transfer(context, 'import') };
