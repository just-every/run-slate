import { env } from 'cloudflare:test';
import { expect, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import worker from '../../../src/server';
import { createApi } from '../../../src/core/app/hono';
import { reviewFixture } from './fixture';

/** An authored attestation crosses its expiry; only the clock is substituted. */
export async function verificationLapse(f: Awaited<ReturnType<typeof reviewFixture>>) {
  const { request } = f;
  const start = Date.now();
  let sequence = 0;
  const op = () => `synthetic-slate-lapse-${++sequence}`;
  const success = async (method: string, path: string, body?: unknown) => {
    const result = await request('owner', method, path, body);
    expect(result.status, result.text).toBe(200);
    return result.data;
  };
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(start);
    const containerId = (await success('POST', '/api/containers', { operationKey: op(), name: 'Incident verification', visibility: 'private' })).value.id;
    const created = await success('POST', '/api/pages', { operationKey: op(), containerId, title: 'Lapseneedle incident procedure', blocks: [{ id: 'synthetic-slate-lapse-body', blockType: 'paragraph', treePosition: '0', content: { text: [{ text: 'Retain the original incident escalation procedure.' }] } }] });
    const id = created.value.pageId, revision = created.receipt.revisionId;
    await success('POST', `/api/pages/${id}/open`, { operationKey: op(), revisionId: revision });
    const expiresAt = new Date(start + 60_000).toISOString();
    const input = { operationKey: op(), expectedRevisionId: revision, statusKey: 'verified', attestRevisionId: revision, expiresAt };
    const receipt = await success('POST', `/api/status/page/${id}`, input);
    const before = (await success('GET', `/api/status/page/${id}`)).verification;
    expect(before).toMatchObject({ state: 'current', current: true, revision_id: revision, expires_at: expiresAt, owner_member_id: 'owner' });
    const attestation = () => env.DB.prepare('SELECT * FROM page_verifications WHERE page_id=? ORDER BY id').bind(id).all();
    const original = (await attestation()).results;
    const history = await success('GET', `/api/revisions/${id}/${revision}`);
    const document = await success('GET', `/api/pages/${id}`);
    const definitions = ['verified', 'lapsed'].map(status => ({ container: containerId, status, orderBy: 'title', limit: 100 }));
    const query = await success('POST', '/api/pages', { operationKey: op(), containerId, title: 'Incident verification index', blocks: definitions.map((definition, index) => ({ id: `synthetic-slate-lapse-query-${index}`, blockType: 'content-query', treePosition: String(index), content: { definition } })) });
    const projections = async (state: 'current' | 'lapsed') => {
      const search = await success('GET', '/api/search?' + new URLSearchParams({ q: 'Lapseneedle' }));
      expect(search.items.map((item: any) => item.id)).toEqual([id]);
      expect(search.items[0].trust.state).toBe(state === 'current' ? 'verified' : 'lapsed');
      const retained = await success('GET', `/api/pages/${query.value.pageId}`);
      expect(retained.blocks.map((block: any) => block.content.definition)).toEqual(definitions);
      for (const definition of definitions) {
        const result = await success('POST', `/api/pages/${query.value.pageId}/query`, definition);
        expect(result.items.map((item: any) => item.id)).toEqual(definition.status === (state === 'current' ? 'verified' : 'lapsed') ? [id] : []);
        if (result.items.length) expect(result.items[0].trust.state).toBe(state === 'current' ? 'verified' : 'lapsed');
      }
      for (const format of ['html', 'markdown', 'pdf', 'docx']) {
        const response = await createApi().request('http://localhost:8787/api/exports/readable', { method: 'POST', headers: { cookie: f.cookies.owner!, 'content-type': 'application/json' }, body: JSON.stringify({ scope: 'page', id, format }) }, env);
        expect(response.status).toBe(200);
        const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
        if (format === 'docx') {
          const body = strFromU8(entries['word/document.xml']!);
          expect(body).toContain('Retain the original incident escalation procedure.');
          expect(body).not.toContain('Verified');
          continue;
        }
        const exported = JSON.parse(strFromU8(entries['slate-readable.json']!)).pages.find((page: any) => page.id === id);
        expect(exported.verification).toEqual({ state, verifiedBy: 'owner', verifiedAt: before.created_at, expiresAt, revisionId: revision });
        if (format === 'pdf') expect(strFromU8(entries[`pages/${id}.pdf`]!.slice(0, 5))).toBe('%PDF-');
        const body = strFromU8(entries[`pages/${id}.${format === 'markdown' ? 'md' : 'html'}`]!);
        expect(body).toContain('Retain the original incident escalation procedure.');
        expect(body).not.toContain('Verified');
      }
    };
    await projections('current');
    const cron = () => worker.scheduled({} as ScheduledController, env);
    await cron();
    expect((await success('GET', '/api/notifications')).items.filter((item: any) => item.event === 'verification-lapsed' && item.pageId === id)).toHaveLength(0);
    vi.setSystemTime(start + 60_001);
    for (let i = 0; i < 4; i++) await cron();
    expect((await success('GET', `/api/status/page/${id}`)).verification).toMatchObject({ state: 'lapsed', current: false, lapsed: true, changedSince: false, revision_id: revision, expires_at: expiresAt });
    const inbox = (await success('GET', '/api/notifications')).items.filter((item: any) => item.event === 'verification-lapsed' && item.pageId === id);
    expect(inbox).toHaveLength(1);
    expect((await request('reader', 'GET', '/api/notifications')).data.items.filter((item: any) => item.event === 'verification-lapsed' && item.pageId === id)).toHaveLength(0);
    await projections('lapsed');
    expect((await success('GET', `/api/pages/${id}`)).page).toEqual(document.page);
    expect(await success('GET', `/api/revisions/${id}/${revision}`)).toEqual(history);
    const after = (await attestation()).results;
    expect(after.map(({ lapsed_notified_at: _, ...row }) => row)).toEqual(original.map(({ lapsed_notified_at: _, ...row }) => row));
    expect(after[0]!.lapsed_notified_at).toBe(new Date(start + 60_001).toISOString());
    expect(await success('POST', `/api/status/page/${id}`, input)).toEqual(receipt);
    expect((await attestation()).results).toEqual(after);
  } finally { vi.useRealTimers(); }
}
