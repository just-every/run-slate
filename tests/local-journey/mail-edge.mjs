import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { waitFor } from './runtime.mjs';

/** Substitute only the paid mail edge in this CLI dev process, as in emitted-runtime.mjs. */
export function withMailEdge(options, Response) {
  if (!options.workers) return options;
  return { ...options, workers: options.workers.map(worker => {
    const vars = worker.bindings;
    if (vars?.LOCAL_DEVELOPMENT !== 'true' || vars.SLATE_PROFILE !== 'flagship' || vars.MAIL_PROVIDER !== 'development' || !vars.RER_DEV_KEY) return worker;
    return { ...worker,
      bindings: { ...vars, MAIL_PROVIDER: 'resend', MAIL_API_KEY: 'test-only-mail-key' },
      outboundService: async request => {
        if (request.url !== 'https://api.resend.com/emails') return fetch(request);
        const message = await request.json();
        await appendFile(process.env.RER_JOURNEY_MAIL_FILE, JSON.stringify(message) + '\n', { mode: 0o600 });
        return new Response(JSON.stringify({ id: crypto.randomUUID() }), { headers: { 'content-type': 'application/json' } });
      },
    };
  }) };
}

/** No mailbox route, UI or printed links: the test reads its private scratch transport capture. */
export async function mailEdge(copy) {
  const file = join(copy.directory, 'tmp', 'step-up-mail.jsonl');
  await writeFile(file, '', { mode: 0o600 });
  return {
    env: { RER_JOURNEY_MAIL_FILE: file, NODE_OPTIONS: `--import=${new URL('./mail-edge-preload.mjs', import.meta.url).href}` },
    async confirmation(origin, email) {
      const message = await waitFor(async () => {
        const lines = (await readFile(file, 'utf8')).split('\n').slice(0, -1).filter(Boolean);
        return lines.length ? JSON.parse(lines.at(-1)) : null;
      }, 'credential step-up mail', 120);
      assert.deepEqual(message.to, [email], 'step-up goes to the signed-in owner');
      let target;
      try { target = new URL(message.text.match(/https?:\/\/\S+/)?.[0]); }
      catch { assert.fail('step-up mail contains a valid confirmation link; private content withheld'); }
      assert.equal(target.origin, origin, 'step-up stays on this local installation');
      assert.equal(target.pathname, '/auth/confirm');
      assert.ok(target.searchParams.get('token'), 'step-up contains a confirmation token');
      return target;
    },
  };
}
