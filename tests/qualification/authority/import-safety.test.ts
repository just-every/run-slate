import {env} from 'cloudflare:test';
import {test, expect, beforeEach, afterEach, vi} from 'vitest';
import {strToU8, zipSync} from 'fflate';
import {createApi} from '../../../src/core/app/hono';
import type {PageDocument} from '../../../src/core/shared/api/content';
import type {ImportFormat, ImportReportEntry} from '../../../src/core/features/imports/types';
import {seedWorkspace, seedMember, sessionFor} from '../../e2e/setup/fixtures';
import {resetDatabase} from '../../e2e/setup/reset-database';

beforeEach(() => resetDatabase(env.DB));
afterEach(() => vi.unstubAllGlobals());

interface Job {
  id: string;
  state: string;
  report: {
    fingerprint?: string;
    unmapped: ImportReportEntry[];
    warnings: ImportReportEntry[];
    sections?: Record<string, {count: number; pages: number}>;
  };
}

test('IMP-004 — native document and reviewed archive imports retain supplied media and reported links without network or unsafe writes', async () => {
  // Fixture acquisition is outside observation; every product request below is observed.
  const fixtures = (env as typeof env & {TEST_IMPORT_FIXTURES: Fetcher}).TEST_IMPORT_FIXTURES;
  const confluenceResponse = await fixtures.fetch('https://fixtures.test/confluence-space-export.zip');
  expect(confluenceResponse.ok).toBe(true);
  const confluence = new Uint8Array(await confluenceResponse.arrayBuffer());
  const {workspaceId} = await seedWorkspace();
  const {memberId} = await seedMember(workspaceId, {
    email: ['synthetic-slate-1', 'example.test'].join('@'), displayName: 'Import owner', role: 'owner', isSetupOwner: true,
  });
  const cookie = await sessionFor(memberId), app = createApi();
  const network = vi.fn(() => { throw new Error('Imports must never issue network requests'); });
  vi.stubGlobal('fetch', network);

  const request = async (path: string, body?: unknown) => {
    const response = await app.request(`https://slate.test/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {Cookie: cookie, ...(body === undefined || body instanceof FormData ? {} : {'Content-Type': 'application/json'})},
      ...(body === undefined ? {} : {body: body instanceof FormData ? body : JSON.stringify(body)}),
    }, env);
    expect(network).not.toHaveBeenCalled();
    return response;
  };
  const ok = async <T,>(path: string, body?: unknown): Promise<T> => {
    const response = await request(path, body), data = await response.json<T>();
    expect(response.status, JSON.stringify(data)).toBe(200);
    return data;
  };
  const upload = (format: ImportFormat, name: string, bytes: Uint8Array) => {
    const form = new FormData();
    form.set('file', new File([bytes as Uint8Array<ArrayBuffer>], name));
    form.set('format', format); form.set('operationKey', crypto.randomUUID());
    return ok<Job>('/imports', form);
  };
  const targetSnapshot = async () => Promise.all([
    'containers', 'container_grants', 'pages', 'page_blocks', 'page_revisions', 'page_grants', 'files',
    'databases', 'database_fields', 'database_records', 'search_text',
  ].map(async table => [table, (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results]));
  const losses = async (job: Job, section: 'unmapped' | 'warnings') => {
    const descriptor = job.report.sections?.[section];
    if (!descriptor) return job.report[section];
    const items: ImportReportEntry[] = [];
    for (let page = 0; page < descriptor.pages; page++) {
      const result = await ok<{items: ImportReportEntry[]; page: number; pages: number; total: number}>(`/imports/${job.id}/report/${section}?page=${page}`);
      expect(result).toMatchObject({page, pages: descriptor.pages, total: descriptor.count});
      items.push(...result.items);
    }
    expect(items).toHaveLength(descriptor.count);
    return items;
  };
  const complete = async (uploaded: Job, reviewed: boolean) => {
    const path = `/imports/${uploaded.id}`;
    let job: Job;
    if (reviewed) {
      const before = await targetSnapshot();
      job = await ok<Job>(path + '/preview', {});
      expect(job.state).toBe('preview');
      expect(await targetSnapshot()).toEqual(before);
      expect((await ok<Job>(path)).report).toEqual(job.report);
      job = await ok<Job>(path + '/apply', {fingerprint: job.report.fingerprint});
    } else job = await ok<Job>(path + '/run', {});
    for (let n = 0; job.state !== 'completed' && n < 100; n++) job = await ok<Job>(path + '/resume', {});
    expect(job.state).toBe('completed');
    expect((await ok<Job>(path)).state).toBe('completed');
    return job;
  };

  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 239, 163, 69, 153, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1" onload="alert(1)"/><use href="https://outside.test/private.svg"/></svg>');
  const missing = Array.from({length: 52}, (_, n) => `https://outside.test/synthetic-slate-${n}.png`);
  const html = '<h1>Safe imported title</h1><script>alert("bad")</script><iframe src="https://outside.test/frame"></iframe>' +
    '<p onclick="alert(1)">Retained safe words <a href="java&#10;script:alert(1)">label</a> <a href="https://outside.test/safe">safe link</a></p>' +
    missing.map(url => `<img src="${url}" onerror="alert(1)">`).join('');
  const archive = zipSync({
    'index.html': strToU8(html + '<img src="supplied.png"><img src="supplied.svg">'),
    'supplied.png': png, 'supplied.svg': svg,
  });
  for (const [format, name, bytes, reviewed] of [
    ['html', 'synthetic-slate-1.html', strToU8(html), false],
    ['google-html-zip', 'synthetic-slate-2.zip', archive, false],
    ['notion-workspace', 'synthetic-slate-3.zip', archive, true],
  ] as const) {
    const job = await complete(await upload(format, name, bytes), reviewed);
    const original = await request(`/imports/${job.id}/original`);
    expect(original.status).toBe(200);
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes);
    const mappings = (await env.DB.prepare("SELECT target_id AS id FROM federation_import_mappings WHERE import_job_id=? AND source_kind='page'").bind(job.id).all<{id: string}>()).results;
    expect(mappings).toHaveLength(1);
    const document = await ok<PageDocument>(`/pages/${mappings[0]!.id}`);
    const persisted = (await env.DB.prepare('SELECT block_type AS blockType,content_json FROM page_blocks WHERE page_id=? ORDER BY tree_position').bind(document.page.id).all<{blockType: string; content_json: string}>()).results;
    expect(persisted.map(block => [block.blockType, JSON.parse(block.content_json)])).toEqual(document.blocks.map(block => [block.blockType, block.content]));
    const serialized = JSON.stringify(document.blocks);
    for (const unsafe of ['onclick', 'onerror', 'javascript:', 'alert(', '<script', '<iframe']) expect(serialized).not.toContain(unsafe);
    expect(serialized).toContain('Retained safe words');
    expect(serialized).toContain('label');
    expect(serialized).toContain('https://outside.test/safe');
    expect(document.blocks.filter(block => block.blockType === 'link-card').map(block => (block.content as {url: string}).url)).toEqual(missing);
    const warnings = await losses(job, 'warnings'), unmapped = await losses(job, 'unmapped');
    expect(warnings.filter(entry => entry.label === 'Image was imported as a link because no archive file was present').map(entry => entry.detail)).toEqual(missing);
    expect(unmapped).toContainEqual(expect.objectContaining({label: 'Removed unsafe HTML element <script>'}));
    expect(unmapped).toContainEqual(expect.objectContaining({label: 'Removed unsafe HTML element <iframe>'}));
    if (reviewed) expect(job.report.sections!.warnings!.pages).toBeGreaterThan(1);
    const results = await ok<{items: {id: string}[]}>('/search?q=Retained%20safe%20words');
    expect(results.items.map(item => item.id)).toContain(document.page.id);
    const files = (await env.DB.prepare('SELECT id,original_name,storage_key FROM files WHERE page_id=? ORDER BY original_name').bind(document.page.id).all<{id: string; original_name: string; storage_key: string}>()).results;
    expect(files.map(file => file.original_name)).toEqual(format === 'html' ? [] : ['supplied.png', 'supplied.svg']);
    for (const file of files) {
      expect(serialized).toContain(`/api/media/${file.id}`);
      const media = await request(`/media/${file.id}`);
      expect(media.status).toBe(200);
      expect(media.headers.get('X-Content-Type-Options')).toBe('nosniff');
      const stored = await env.FILES.get(file.storage_key);
      expect(stored).not.toBeNull();
      if (file.original_name === 'supplied.png') {
        expect(new Uint8Array(await media.arrayBuffer())).toEqual(png);
        expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(png);
      } else {
        const served = await media.text(), retained = await stored!.text();
        expect(retained).toContain('<rect');
        for (const unsafe of ['<script', 'alert(', 'onload', 'https://outside.test']) {
          expect(retained).not.toContain(unsafe); expect(served).not.toContain(unsafe);
        }
      }
    }
  }

  // This unchanged incumbent export carries twelve remote images and no attachments.
  const real = await complete(await upload('confluence-space', 'confluence-space-export.zip', confluence), true);
  const remoteLosses = (await losses(real, 'unmapped')).filter(entry => entry.label === 'Confluence image is hosted outside the archive, so it was imported as a link');
  expect(remoteLosses).toHaveLength(12);
  const realPages = (await env.DB.prepare("SELECT target_id AS id FROM federation_import_mappings WHERE import_job_id=? AND source_kind='page'").bind(real.id).all<{id: string}>()).results;
  expect(realPages).toHaveLength(3);
  const realDocuments = await Promise.all(realPages.map(page => ok<PageDocument>(`/pages/${page.id}`)));
  const retainedLinks = realDocuments.flatMap(document => document.blocks.filter(block => block.blockType === 'link-card').map(block => (block.content as {url: string}).url));
  for (const loss of remoteLosses) expect(retainedLinks).toContain(loss.detail);
  expect(await env.DB.prepare('SELECT count(*) AS n FROM files WHERE page_id IN (SELECT target_id FROM federation_import_mappings WHERE import_job_id=?)').bind(real.id).first<number>('n')).toBe(0);

  // Unsafe structures must fail before any part of an existing target changes.
  const malformed = zipSync({'entities.xml': strToU8('<root><unclosed></root>')});
  const declared = zipSync({'entities.xml': strToU8('<!DOCTYPE root [<!ENTITY xxe SYSTEM "https://outside.test/entity">]><root>&xxe;</root>')});
  const traversal = zipSync({'../escape.md': strToU8('# escape')});
  const expansion = zipSync({'page.md': strToU8('A'.repeat(131_072))});
  const localName = zipSync({'page.md': strToU8('# page')}); localName.set(strToU8('evil.md'), 30);
  for (const [format, bytes, code] of [
    ['notion-workspace', traversal, 'IMPORT_ARCHIVE_PATH_UNSAFE'],
    ['notion-workspace', expansion, 'IMPORT_ARCHIVE_COMPRESSION_RATIO'],
    ['notion-workspace', localName, 'IMPORT_ARCHIVE_INVALID'],
    ['confluence-space', malformed, 'IMPORT_FORMAT_INVALID'],
    ['confluence-space', declared, 'IMPORT_FORMAT_INVALID'],
    ['google-html-zip', traversal, 'IMPORT_ARCHIVE_PATH_UNSAFE'],
    ['google-html-zip', expansion, 'IMPORT_ARCHIVE_COMPRESSION_RATIO'],
    ['google-html-zip', localName, 'IMPORT_ARCHIVE_INVALID'],
  ] as const) {
    const before = await targetSnapshot();
    const job = await upload(format, 'synthetic-slate-4.zip', bytes);
    const response = await request(`/imports/${job.id}/${format === 'google-html-zip' ? 'run' : 'preview'}`, {});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({code});
    expect((await ok<Job>(`/imports/${job.id}`)).state).toBe('failed');
    expect(await targetSnapshot()).toEqual(before);
  }
  expect(network).not.toHaveBeenCalled();
}, 120_000);
