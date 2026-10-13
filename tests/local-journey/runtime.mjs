import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, rm, statfs, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { denyProviderCommands } from './provider-guard.mjs';
import { inspectionMs, readProcessTable } from '@runeditrun/rer/internal/onboarding/process-table.mjs';
const execute = promisify(execFile);
export const repo = fileURLToPath(new URL('../../', import.meta.url));
const excluded = new Set(['.git', 'node_modules', 'dist', '.wrangler', '.rer', '.seed', '.dev.vars', '.dev.vars.previous', 'test-results', 'playwright-report', '.artifacts', '.vitest', '.tanstack', 'delivery-artifact']);
export async function resources() {
  const disk = await statfs(repo);
  assert.ok(disk.bavail * disk.bsize >= 15 * 1024 ** 3, 'local journey requires 15 GiB free');
  if (process.platform !== 'darwin') return;
  for (let n = 0; n <= 20; n++) {
    const { stdout } = await execute('sysctl', ['-n', 'vm.loadavg']);
    if (Number(stdout.match(/[\d.]+/)[0]) <= 36) return;
    assert.ok(n < 20, 'load exceeded 36 for 20 minutes');
    await delay(60_000);
  }
}
export async function scratch() {
  await resources();
  const directory = await mkdtemp(join(repo, '../.slate-journey-'));
  const root = join(directory, 'slate');
  await cp(repo, root, { recursive: true, filter: p => p !== join(repo, 'exports') && !excluded.has(basename(p)) && !basename(p).startsWith('.env') && !basename(p).startsWith('.dev.vars') && !basename(p).startsWith('.slate-journey-') });
  await mkdir(join(directory, 'tmp'), { mode: 0o700 });
  const providerGuard = await denyProviderCommands(directory);
  // A person's `rer` (npm install -g @runeditrun/rer): the pinned package's own launcher, which installs and runs the checkout's pin.
  const bin = join(directory, 'rer-bin');
  await mkdir(bin);
  await writeFile(join(bin, 'rer'), `#!/bin/sh\nexec node ${JSON.stringify(join(repo, 'node_modules/@runeditrun/rer/global/rer.mjs'))} "$@"\n`, { mode: 0o755 });
  const env = { PATH: `${bin}:${providerGuard.PATH}`, HOME: process.env.HOME, CI: 'true', TMPDIR: join(directory, 'tmp'), WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(directory, 'tmp/wrangler.log'), RER_SERVERS_DIR: join(directory, 'servers'), RER_JOBS_DIR: join(directory, 'queue'), npm_config_child_concurrency: '1', npm_config_network_concurrency: '2',
    // The caller's own queue limits (RER_JOBS_*), for a host where they differ from the defaults.
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith('RER_JOBS_') && name !== 'RER_JOBS_DIR')) };
  const children = new Set();
  function start(command, args, cwd = root, extra = {}) {
    const child = spawn('nice', ['-n', '15', command, ...args], { cwd, env: { ...env, RER_SERVER_JOURNEY: '1', ...extra }, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    child.output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { child.output += data; });
    child.done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
    return child;
  }
  async function stop(child) {
    if (!child) return;
    if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    const closed = await Promise.race([child.done.then(() => true), delay(10_000).then(() => false)]);
    // A successful launcher closes its separately owned app before it exits.
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } await child.done; }
    for (let i = 0; i < 40 && (await readProcessTable(inspectionMs, child.pid)).length; i++) {
      if (i === 20) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
      await delay(100);
    }
    assert.equal((await readProcessTable(inspectionMs, child.pid)).length, 0, 'scratch command process group stopped');
    children.delete(child);
  }
  async function run(command, args, cwd, extra) {
    if (command === 'node' || command === 'pnpm') await resources();
    const child = start(command, args, cwd, extra);
    // The capture travels on the error for saveFailure's redaction; the message stays credential-free.
    try { const code = await child.done; if (code !== 0) throw Object.assign(new assert.AssertionError({ message: `${command} command failed with exit ${code}; output withheld to protect credentials`, actual: code, expected: 0, operator: 'strictEqual' }), { capture: { command: [command, ...args].join(' ').slice(0, 200), cwd, output: child.output } }); return child.output; } finally { await stop(child); }
  }
  try {
    await run('git', ['init', '--quiet']);
    await run('git', ['add', '.']);
    await run('git', ['-c', 'user.name=Local Journey', '-c', 'user.email=journey@example.test', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Local journey source snapshot']);
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return { root, directory, env, providerGuard, start, run, stop, async close() { try { for (const child of children) await stop(child); } finally { await rm(directory, { recursive: true, force: true }); } } };
}
export async function waitFor(observe, label, attempts = 2400) {
  for (let i = 0; i < attempts; i++) { const value = await observe(); if (value) return value; await delay(250); }
  assert.fail(`timed out waiting for ${label}`);
}
export async function healthy(origin) {
  await waitFor(async () => { try { return (await fetch(origin + '/health')).status === 200; } catch { return false; } }, 'native health');
}
