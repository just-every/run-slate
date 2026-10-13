import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function sentinels(root) {
  await mkdir(join(root, 'exports'), { recursive: true });
  await writeFile(join(root, 'exports', 'auth-journey.rer'), 'harmless archive sentinel');
  await writeFile(join(root, 'auth-journey.rer'), 'harmless archive sentinel');
}

/** Probe the actual public listener, without a local key or session cookie. */
export async function publicStatuses(origin, root, mode) {
  // The outbox and dev identity answer only with the checkout's dev key.
  const paths = ['/cdn-cgi/local/explorer/api/d1/database', '/cdn-cgi/handler/scheduled', '/.rer/local/dev-key.env', '/.seed/installer', '/__dev/outbox', '/__dev/personas', '/auth/dev/enter?as=owner'];
  const result = [];
  for (const path of paths) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.equal(response.status, 404, `${mode}: ${path}`); await response.body?.cancel();
    result.push({ mode, path, expected: 404, actual: response.status });
  }
  if (mode === 'dev') for (const path of ['/auth-journey.rer', '/exports/auth-journey.rer', `/@fs${root}/exports/auth-journey.rer`, `/@fs${root}/auth-journey.rer`]) {
    const response = await fetch(origin + path, { redirect: 'manual' });
    assert.ok([403,404].includes(response.status), `${mode}: ${path}`); await response.body?.cancel();
    result.push({ mode, path: path.replace(root, '<checkout>'), expected: [403,404], actual: response.status });
  }
  console.log(JSON.stringify({ publicStatuses: result }));
}

/** Observe setup's short-lived production preview while the public command runs. */
export async function setupStatuses(copy, child) {
  for (;;) {
    let origin;
    try { origin = parseEnv(await readFile(join(copy.root, '.dev.vars'), 'utf8')).APP_URL; } catch {}
    if (origin) {
      try {
        const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.status === 200) { await publicStatuses(origin, copy.root, 'setup'); return; }
      } catch (cause) { if (cause?.code === 'ERR_ASSERTION') throw cause; }
    }
    assert.equal(child.exitCode, null, 'observe the setup preview before it exits');
    await delay(10);
  }
}
