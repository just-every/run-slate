import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { api, idleActorBudget, registerActor, useActor } from './journey-api.mjs';
import { JourneyRequestBudget } from './journey-request-budget.mjs';
import { call } from './two-people-support.mjs';

test('snapshot probes and call share one actor queue, browser address and real refusal', async () => {
  const requests = [];
  let active = 0, maximumActive = 0;
  const server = createServer((req, res) => {
    requests.push({ at: performance.now(), path: req.url, ip: req.headers['cf-connecting-ip'], cookie: req.headers.cookie });
    const probe = req.url.startsWith('/api/snapshot/') || ['/api/mutation', '/api/activity/cursor'].includes(req.url);
    if (probe) maximumActive = Math.max(maximumActive, ++active);
    setTimeout(() => {
      res.writeHead(req.url === '/api/refused' ? 429 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, ip: req.headers['cf-connecting-ip'] }));
      if (probe) active--;
    }, 10);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.SLATE_CHROMIUM_PATH ? { executablePath: process.env.SLATE_CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    const owner = await browser.newContext(), reader = await browser.newContext();
    await owner.addCookies([{ name: 'slate_session', value: 'owner-test-session', url: origin }]);
    await reader.addCookies([{ name: 'slate_session', value: 'reader-test-session', url: origin }]);
    registerActor(origin, 'slate_session=owner-test-session', 'test-owner');
    registerActor(origin, 'slate_session=reader-test-session', 'test-reader');
    await useActor(owner, origin);
    await useActor(reader, origin);
    const page = await owner.newPage();
    await page.goto(origin + '/api/browser');
    const browserIp = requests.find(row => row.path === '/api/browser').ip;
    await assert.rejects(idleActorBudget(owner, origin), /unmounted actor/);
    // The comments snapshot is one of five parallel branches; the alternate
    // call transport and a cursor page must consume the same actor's budget.
    await Promise.all([
      ...['activity', 'document', 'revisions', 'comments', 'grants'].map(part => api(owner, origin, 'GET', '/api/snapshot/' + part)),
      call(owner, origin, 'POST', '/api/mutation', { operationKey: 'test-only' }),
      api(owner, origin, 'GET', '/api/activity/cursor'),
    ]);
    const probes = requests.filter(row => row.path.startsWith('/api/snapshot/') || ['/api/mutation', '/api/activity/cursor'].includes(row.path));
    assert.equal(probes.length, 7);
    assert.ok(probes.every(row => row.ip === browserIp && row.cookie === 'slate_session=owner-test-session'));
    assert.equal(maximumActive, 1, 'Snapshot branches and alternate helpers have one in-flight probe per actor');
    const read = await api(owner, origin, 'GET', '/api/reader', undefined, { headers: { cookie: 'slate_session=reader-test-session' } });
    const readerPage = await reader.newPage();
    await readerPage.goto(origin + '/api/reader-browser');
    assert.notEqual(read.body.ip, browserIp);
    assert.equal(read.body.ip, requests.find(row => row.path === '/api/reader-browser').ip);
    const refused = await call(owner, origin, 'GET', '/api/refused');
    assert.equal(refused.status, 429);
    assert.equal(requests.filter(row => row.path === '/api/refused').length, 1, 'A refusal is returned once without retry');
    await page.goto(origin + '/api/owner-again');
    assert.equal(requests.find(row => row.path === '/api/owner-again').ip, browserIp, 'A cookie override cannot change the owner browser address');
    await owner.clearCookies();
    await owner.addCookies([{ name: 'slate_session', value: 'reader-test-session', url: origin }]);
    await useActor(owner, origin);
    await page.goto(origin + '/api/switched');
    assert.equal(requests.find(row => row.path === '/api/switched').ip, read.body.ip);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});


test('probe bursts stay within 400 per rolling minute without delaying light traffic', async () => {
  let now = 0;
  const waits = [], dispatched = [];
  const budget = new JourneyRequestBudget({ now: () => now, wait: async ms => { waits.push(ms); now += ms; } });
  for (let i = 0; i < 100; i++) { await budget.reserve(); dispatched.push(now); }
  assert.deepEqual(waits, [], 'A short sequence needs no fixed per-request delay');
  for (let i = 0; i < 350; i++) { await budget.reserve(); dispatched.push(now); }
  assert.ok(waits.every(ms => ms === 200), 'Only spent burst credits wait for a refill');
  for (let i = 400; i < dispatched.length; i++) assert.ok(dispatched[i] - dispatched[i - 400] >= 60000, 'No rolling minute can dispatch more than 400 probes');
  now += 120000;
  const before = waits.length;
  for (let i = 0; i < 100; i++) await budget.reserve();
  assert.equal(waits.length, before, 'An idle actor recovers its bounded burst allowance');
  await budget.reserve();
  assert.equal(waits.length, before + 1, 'Idle time cannot accumulate an unlimited burst');
});


test('the idle-owner probe budget still reserves 100 native requests per minute', async () => {
  let now = 0;
  const dispatched = [];
  const budget = new JourneyRequestBudget({ refillEveryMs: 150, now: () => now, wait: async ms => { now += ms; } });
  for (let i = 0; i < 550; i++) { await budget.reserve(); dispatched.push(now); }
  for (let i = 500; i < dispatched.length; i++) assert.ok(dispatched[i] - dispatched[i - 500] >= 60000);
});
