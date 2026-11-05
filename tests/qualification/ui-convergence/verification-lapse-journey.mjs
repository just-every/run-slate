import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { expect } from '@playwright/test';
import { accessible } from './browser-evidence.mjs';
import { ok } from './two-people-support.mjs';

const attestation = v => Object.fromEntries(['id', 'page_id', 'revision_id', 'status_key', 'owner_member_id', 'verified_by_member_id', 'expires_at', 'created_at'].map(key => [key, v[key]]));

/** Native authored expiry, cron delivery and retained projections at both responsive widths. */
export async function verificationLapseJourney(state) {
  const { page, context, origin, api } = state;
  const start = Date.now(), expiresAt = new Date(start + 60_000).toISOString();
  const mutate = (route, data) => ok(context, origin, 'POST', route, { operationKey: randomUUID(), ...data });
  await state.setClock(start);
  await page.clock.setFixedTime(new Date(start));
  try {
    const statuses = await api('/api/status');
    if (!statuses.items.some(item => item.key === 'verified' && item.requiresVerification)) {
      await mutate('/api/status', { key: 'verified', label: 'Verified', color: '#228855', requiresVerification: true });
    }
    const container = (await mutate('/api/containers', { name: 'Incident assurance', visibility: 'private' })).value.id;
    const created = await mutate('/api/pages', { containerId: container, title: 'Lapseneedle escalation procedure', blocks: [{ id: randomUUID(), blockType: 'paragraph', treePosition: '0', content: { text: [{ text: 'Contact the incident lead before escalating the service outage.' }] } }] });
    const id = created.value.pageId;
    await page.goto(`${origin}/app/pages/${id}`, { waitUntil: 'networkidle' });
    const opened = await api(`/api/pages/${id}`);
    const revision = opened.workingRevisionId;
    const input = { operationKey: randomUUID(), expectedRevisionId: opened.page.revisionId, statusKey: 'verified', attestRevisionId: revision, expiresAt };
    const receipt = await ok(context, origin, 'POST', `/api/status/page/${id}`, input);
    const original = (await api(`/api/status/page/${id}`)).verification;
    assert.equal(original.state, 'current');
    assert.equal(original.revision_id, revision);
    assert.equal(original.expires_at, expiresAt);
    const snapshot = await api(`/api/revisions/${id}/${revision}`);
    const document = await api(`/api/pages/${id}`);
    const definitions = ['verified', 'lapsed'].map(status => ({ container, status, orderBy: 'title', limit: 20 }));
    const index = (await mutate('/api/pages', { containerId: container, title: 'Incident assurance index', blocks: definitions.map((definition, i) => ({ id: randomUUID(), blockType: 'content-query', treePosition: String(i), content: { definition } })) })).value.pageId;
    const notices = async () => (await api('/api/notifications?limit=100')).items.filter(item => item.event === 'verification-lapsed' && item.pageId === id);
    const queries = async lapsed => {
      await page.goto(`${origin}/app/pages/${index}`, { waitUntil: 'networkidle' });
      assert.deepEqual((await api(`/api/pages/${index}`)).blocks.map(block => block.content.definition), definitions);
      for (const [i, definition] of definitions.entries()) {
        const expected = (definition.status === 'lapsed') === lapsed ? [id] : [];
        const result = await ok(context, origin, 'POST', `/api/pages/${index}/query`, definition);
        assert.deepEqual(result.items.map(item => item.id), expected);
        if (expected.length) assert.equal(result.items[0].trust.state, lapsed ? 'lapsed' : 'verified');
        const region = page.getByRole('region', { name: 'Content query', exact: true }).nth(i);
        await expect(region.locator('tbody tr button')).toHaveText(expected.length ? ['Lapseneedle escalation procedure'] : []);
      }
    };
    await page.goto(`${origin}/app/pages/${id}?detail=status`, { waitUntil: 'networkidle' });
    await expect(page.locator('.verification-summary')).toHaveAttribute('data-state', 'current');
    await accessible(page, 'verification lapse current attestation');
    await queries(false);
    await state.runScheduled();
    await state.runScheduled();
    assert.equal((await notices()).length, 0, 'A future expiry sends no lapse notice.');

    // Advance time only. The stored attestation, expiry and revision are never edited.
    await state.setClock(start + 60_001);
    await page.clock.setFixedTime(new Date(start + 60_001));
    for (let run = 0; run < 4; run++) await state.runScheduled();
    const lapsed = (await api(`/api/status/page/${id}`)).verification;
    assert.equal(lapsed.state, 'lapsed');
    assert.equal(lapsed.current, false);
    assert.equal(lapsed.changedSince, false);
    assert.deepEqual(attestation(lapsed), attestation(original), 'Cron retains the exact original attestation.');
    assert.equal((await notices()).length, 1, 'Repeated real cron processing delivers one owner inbox notice.');
    assert.deepEqual((await api(`/api/pages/${id}`)).page, document.page);
    assert.deepEqual(await api(`/api/revisions/${id}/${revision}`), snapshot, 'The attested revision is retained byte for byte.');
    assert.deepEqual(await ok(context, origin, 'POST', `/api/status/page/${id}`, input), receipt, 'Replaying the original attestation cannot renew it.');
    assert.deepEqual((await api(`/api/status/page/${id}`)).verification, lapsed);
    for (const reload of [false, true]) {
      if (reload) await page.reload({ waitUntil: 'networkidle' });
      else await page.goto(`${origin}/app/pages/${id}?detail=status`, { waitUntil: 'networkidle' });
      await expect(page.locator('.verification-summary')).toHaveAttribute('data-state', 'lapsed');
      await expect(page.locator('.page-status-chip')).toHaveText('Verification lapsed');
      await expect(page.locator('.verification-summary')).not.toContainText('is the current one');
      await expect(page.locator('.verification-summary')).toContainText('Alex Owner');
    }
    await accessible(page, 'verification lapse retained after reload');
    const history = page.getByRole('link', { name: 'Open the verified revision', exact: true });
    await expect(history).toHaveAttribute('href', `/app/pages/${id}?detail=history&revision=${revision}`);
    await history.click();
    await expect(page.locator('.right')).toContainText('Contact the incident lead before escalating the service outage.');
    await accessible(page, 'verification lapse original history');

    await page.goto(`${origin}/app/search?q=Lapseneedle&kind=page`, { waitUntil: 'networkidle' });
    await expect(page.locator('.search-results h2')).toHaveText(['Lapseneedle escalation procedure']);
    await expect(page.locator('.search-results .trust-state')).toHaveText(['Lapsed']);
    const search = await api('/api/search?q=Lapseneedle&kind=page');
    assert.deepEqual(search.items.map(item => [item.id, item.trust.state]), [[id, 'lapsed']]);
    assert.deepEqual((await api('/api/search?q=Lapseneedle&kind=page&status=verified')).items, []);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.search-results .trust-state')).toHaveText(['Lapsed']);
    await accessible(page, 'verification lapse search');
    await queries(true);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('region', { name: 'Content query', exact: true }).nth(1).locator('tbody tr button')).toHaveText(['Lapseneedle escalation procedure']);
    await accessible(page, 'verification lapse persisted content queries');

    for (const format of ['html', 'markdown']) {
      await page.goto(`${origin}/app/pages/${id}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export page', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Export readable content', exact: true });
      await dialog.getByLabel('Format', { exact: true }).selectOption(format);
      const pending = page.waitForEvent('download');
      await dialog.getByRole('button', { name: 'Download export', exact: true }).click();
      const download = await pending, entries = unzipSync(await readFile(await download.path()));
      const manifest = JSON.parse(strFromU8(entries['slate-readable.json']));
      assert.deepEqual(manifest.pages.find(item => item.id === id).verification, { state: 'lapsed', verifiedBy: 'Alex Owner', verifiedAt: original.created_at, expiresAt, revisionId: revision });
      const body = strFromU8(entries[`pages/${id}.${format === 'html' ? 'html' : 'md'}`]);
      assert.match(body, /Contact the incident lead before escalating the service outage\./);
      assert.doesNotMatch(body, /Verified/);
      await expect(dialog).toHaveCount(0);
    }
    await page.goto(origin + '/app/inbox', { waitUntil: 'networkidle' });
    const notice = page.locator('.outcome-list li').filter({ hasText: 'verification lapsed' }).filter({ hasText: 'Lapseneedle escalation procedure' });
    await expect(notice).toHaveCount(1);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(notice).toHaveCount(1);
    await accessible(page, 'verification lapse one retained inbox notice');
    console.log(`PROBE STAT-004 native-lapse width=${page.viewportSize().width}: future exact-revision attestation -> lapsed; cron=6 ownerNotices=1; history unchanged; search and persisted queries lapsed; downloaded HTML and Markdown manifests lapsed`);
  } finally {
    await state.setClock(null);
    await page.clock.setFixedTime(new Date());
  }
}
