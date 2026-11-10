import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { api, idleActorBudget, registerActor, useActor, actorRequestPeaks } from './journey-api.mjs';
import { routeJourneyApi } from './routed-journey-api.mjs';
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
    const peaks = actorRequestPeaks(origin);
    const ownerPeak = peaks.find(row => row.actor === 'test-owner');
    const readerPeak = peaks.find(row => row.actor === 'test-reader');
    assert.equal(ownerPeak.total, 10, 'Count browser work and every probe, including a refused request, once');
    assert.equal(ownerPeak.peak, 10);
    assert.deepEqual(ownerPeak.sources, {browser: 2, probe: 8});
    assert.equal(readerPeak.total, 3, 'Cookie overrides and switched contexts retain the same reader bucket');
    assert.equal(readerPeak.peak, 3);
    assert.deepEqual(readerPeak.sources, {probe: 1, browser: 2});
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


test('proposal browser API fan-outs and helper snapshots share real queued dispatch without retries', async () => {
  const requests = [];
  let active = 0, maximumActive = 0;
  const server = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, {'content-type': 'text/html'}); res.end('<main>Native transport fixture</main>'); return; }
    const row = {path: req.url, cookie: req.headers.cookie, ip: req.headers['cf-connecting-ip'], body: ''};
    requests.push(row);
    maximumActive = Math.max(maximumActive, ++active);
    req.on('data', chunk => { row.body += chunk; });
    req.on('end', () => setTimeout(() => {
      if (req.url === '/api/files/raw') { res.writeHead(200, {'content-type': 'application/octet-stream'}); res.end(Buffer.from([0, 255, 128, 13, 10])); active--; return; }
      const refused = req.url === '/api/refused';
      res.writeHead(refused ? 429 : 200, {'content-type': 'application/json', ...(refused ? {'retry-after': '60'} : {})});
      res.end(JSON.stringify({path: req.url, ...(row.body ? {submitted: JSON.parse(row.body)} : {})}));
      active--;
    }, 10));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless: true, ...(process.env.SLATE_CHROMIUM_PATH ? {executablePath: process.env.SLATE_CHROMIUM_PATH} : {}), args: ['--no-sandbox']});
  try {
    const context = await browser.newContext();
    await context.addCookies([{name: 'slate_session', value: 'proposal-owner', url: origin}]);
    registerActor(origin, 'slate_session=proposal-owner', 'proposal-owner');
    await useActor(context, origin);
    const restore = await routeJourneyApi(context, origin);
    const page = await context.newPage();
    await page.goto(origin);
    // Page-level timing fixtures fall through to the shared context transport.
    await page.route('**/api/native/*', route => route.fallback());
    const [native, snapshot] = await Promise.all([
      page.evaluate(async () => Promise.all([
        ...Array.from({length: 6}, (_, i) => fetch('/api/native/' + i).then(r => r.json())),
        fetch('/api/write', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({operationKey: 'native-capture', question: 'Retained question'})}).then(r => r.json()),
        fetch('/api/refused').then(async r => ({status: r.status, retryAfter: r.headers.get('retry-after'), body: await r.json()})),
      ])),
      api(context, origin, 'GET', '/api/snapshot'),
    ]);
    assert.equal(snapshot.status, 200);
    assert.deepEqual(native[6].submitted, {operationKey: 'native-capture', question: 'Retained question'});
    assert.deepEqual(native[7], {status: 429, retryAfter: '60', body: {path: '/api/refused'}});
    assert.equal(requests.filter(row => row.path === '/api/refused').length, 1);
    assert.equal(maximumActive, 1, 'Browser fan-outs and snapshots have one actual in-flight request per actor');
    assert.equal(requests.length, 9);
    assert.ok(requests.every(row => row.cookie === 'slate_session=proposal-owner' && row.ip === requests[0].ip));
    const [peak] = actorRequestPeaks(origin);
    assert.equal(peak.actor, 'proposal-owner');
    assert.equal(peak.total, 9, 'Routed browser issuance is not counted a second time');
    assert.equal(peak.peak, 9);
    const binary = await page.evaluate(() => fetch('/api/files/raw').then(async r => [...new Uint8Array(await r.arrayBuffer())]));
    assert.deepEqual(binary, [0, 255, 128, 13, 10], 'Existing binary doors keep exact browser response bytes');
    assert.equal(actorRequestPeaks(origin)[0].total, 10, 'Unrouted binary browser requests still count once');
    await context.setOffline(true);
    assert.equal(await page.evaluate(() => fetch('/api/offline-write', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({question: 'Must stay local'})}).then(() => false, () => true)), true);
    assert.equal(requests.filter(row => row.path === '/api/offline-write').length, 0, 'Intentional browser network loss never enters the independent API transport');
    await context.setOffline(false);
    await restore();
    await page.evaluate(() => fetch('/api/restored').then(r => r.json()));
    assert.equal(actorRequestPeaks(origin)[0].total, 11, 'Direct browser counting resumes when the scoped transport is removed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
