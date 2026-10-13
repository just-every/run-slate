import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadLocalSettings } from '../scripts/installer/settings.mjs';
import { freePort } from '@runeditrun/rer/adapter-settings';
import { createCommands } from '@runeditrun/rer/commands';
import { privateDirectory } from '@runeditrun/rer/private-files';
const root = fileURLToPath(new URL('../', import.meta.url));
const cancellation = new AbortController();
const handlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => cancellation.abort()]));
let commands;
try {
  // The bridge is available only for an explicitly configured loopback app.
  const vars = await loadLocalSettings(root);
  const port = process.env.SLATE_AI_LOCAL_PORT ? Number(process.env.SLATE_AI_LOCAL_PORT) : await freePort();
  const token = randomBytes(32).toString('hex'), model = process.env.SLATE_AI_MODEL ?? 'gpt-6-astra';
  const directory = await privateDirectory(root, ['.seed', 'local-agent']);
  commands = await createCommands(directory, { logs: [] });
  commands.addSecrets([token, vars.SESSION_SECRET]);
  for (const [signal, handler] of handlers) process.on(signal, handler);
  const env = { ...process.env, SLATE_AI_ENABLED: 'true', SLATE_AI_PROVIDER: 'local-codex', SLATE_AI_LOCAL_URL: `http://127.0.0.1:${port}`, SLATE_AI_LOCAL_TOKEN: token, SLATE_AI_MODEL: model, SLATE_AI_LOCAL_PORT: String(port) };
  const options = { cwd: root, env, signal: cancellation.signal };
  const bridge = commands.spawn('Starting local inference bridge', process.execPath, [join(root, 'local-agent/server.mjs')], options);
  bridge.once('exit', () => cancellation.abort());
  await commands.waitForReady('Starting local inference bridge', bridge, async signal => {
    const response = await fetch(`${env.SLATE_AI_LOCAL_URL}/v1/readiness`, { signal, headers: { Authorization: `Bearer ${token}` } });
    await response.body?.cancel(); return response.ok;
  }, { signal: cancellation.signal });
  await commands.run('Starting Slate', process.execPath, [join(root, 'node_modules/@runeditrun/rer/bin/rer.mjs'), 'dev', ...process.argv.slice(2)], options);
} catch (error) {
  console.error(commands ? commands.redact(error.message) : error.message); process.exitCode = 1;
} finally {
  await commands?.closeCommands();
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}
