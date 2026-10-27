import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const exampleBusinessCarry = {
  version: 1,
  origin: 'https://billing-qualification.runeditrun.com',
  business_id: '7e1d0c2a-5b8f-4c3e-9a10-4e2f00c0ffee',
  business_url: 'https://billing-qualification.runeditrun.com/business/7e1d0c2a-5b8f-4c3e-9a10-4e2f00c0ffee',
  name: 'Example Business Co',
  legal_name: null,
  accent: null,
  logo_url: null,
  refreshed_at: '2026-10-27T09:00:00.000Z',
};

export async function createBusinessCarryRuntime(root, evidence) {
  const cli = join(root, 'node_modules/@runeditrun/rer/bin/rer.mjs');
  const carryFile = join(root, '.rer/local/business.json');
  await Promise.all(['shots', 'text', 'empty-business-state', 'servers', 'jobs']
    .map(part => mkdir(join(evidence, part), { recursive: true })));
  const env = {
    ...process.env,
    HOME: process.env.RER_PROOF_HOME ?? process.env.HOME,
    RER_BUSINESS_STATE_DIR: join(evidence, 'empty-business-state'),
    RER_SERVERS_DIR: join(evidence, 'servers'),
    RER_JOBS_DIR: join(evidence, 'jobs'),
    RER_SERVER_JOURNEY: '1',
    WRANGLER_SEND_METRICS: 'false',
  };
  let dev;

  function start(verb, flags = []) {
    const child = spawn(process.execPath, [cli, verb, ...flags, '--non-interactive'], {
      cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.output = '';
    child.stdout.on('data', bytes => {
      child.output += bytes;
      if (String(bytes).includes('server restarted.')) console.log('Dev restart complete at ' + Date.now());
    });
    child.stderr.on('data', bytes => { child.output += bytes; });
    child.done = new Promise((resolve, reject) => {
      child.once('error', () => reject(Error(`${verb} failed to start; private command output withheld`)));
      child.once('close', resolve);
    });
    if (verb === 'dev') dev = child;
    console.log(`Started ${verb} PID ${child.pid}`);
    return child;
  }

  async function run(verb, flags = []) {
    const child = start(verb, flags);
    assert.equal(await child.done, 0, `${verb} must exit successfully; private command output withheld`);
  }

  async function until(check, message, timeout = 120_000) {
    const began = Date.now();
    while (Date.now() - began < timeout) {
      if (dev && (dev.exitCode !== null || dev.signalCode !== null)) {
        throw Error('The started dev command exited; private output withheld');
      }
      if (await check()) return Date.now() - began;
      await delay(100);
    }
    throw Error(message);
  }

  async function stop() {
    if (!dev || dev.exitCode !== null || dev.signalCode !== null) return;
    const active = dev;
    active.kill('SIGTERM');
    let timer;
    try {
      await Promise.race([
        active.done,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(`Started server PID ${active.pid} did not stop`)), 20_000);
          timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { carryFile, start, run, until, stop, get dev() { return dev; } };
}
