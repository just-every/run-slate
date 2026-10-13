import { env } from 'cloudflare:test';
import { createApi } from '../../../src/core/app/hono';
import type { AppBindings } from '../../../src/core/app/types';
import { searchFixture } from '../search/route-fixture';

/** Members, sessions and the shared collection of the search fixture, with verified pages and the public routes. */
export async function reviewFixture(db: D1Database = env.DB) {
  const base = await searchFixture(db), { sql, now, cookies } = base;
  await sql("INSERT INTO status_entries(id,workspace_id,key,label,color,requires_verification,created_at,updated_at) VALUES('verified-entry','w','verified','Verified','#228855',1,?,?)", now, now);
  const app = createApi();
  const request = async (actor: string, method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = actor === 'anonymous' ? {} : { cookie: cookies[actor]! };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await app.fetch(new Request('http://localhost:8787' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { ...env, DB: db } as AppBindings);
    const text = await response.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* HTML or empty bodies stay text */ }
    return { status: response.status, data, text };
  };
  const at = (days: number) => new Date(Date.parse(now) + days * 86_400_000).toISOString();
  /** A page with one committed revision, as the routes would have written it. */
  const page = async (id: string, options: { title?: string; container?: string; parent?: string; author?: string; restricted?: boolean; lifecycle?: string } = {}) => {
    await sql("INSERT INTO pages(id,workspace_id,container_id,parent_page_id,page_kind,title,author_member_id,lifecycle,working_revision_id,published_revision_id,created_at,updated_at,revision_id,access_inheritance) VALUES(?,'w',?,?,'page',?,?,?,?,?,?,?,?,?)", id, options.container ?? 'c', options.parent ?? null, options.title ?? id, options.author ?? 'owner', options.lifecycle ?? 'live', 'rev-' + id, options.lifecycle === 'draft' ? null : 'rev-' + id, now, now, 'op-' + id, options.restricted ? 'restricted' : 'inherit');
    await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,?,'publish','h','[]',?,?)", 'rev-' + id, id, options.author ?? 'owner', JSON.stringify({ title: options.title ?? id }), at(-40));
    if (options.lifecycle !== 'draft') await sql('INSERT OR IGNORE INTO content_published_revisions VALUES(?,?)', id, 'rev-' + id);
  };
  /** A verification row as `setPageStatus` writes it; `changed` adds a later revision by `editor`. */
  const verify = async (id: string, options: { verifier?: string; expiresAt?: string | null; changed?: boolean; editor?: string } = {}) => {
    await sql("UPDATE pages SET status_key='verified' WHERE id=?", id);
    await sql("INSERT INTO page_verifications(id,page_id,revision_id,status_key,owner_member_id,verified_by_member_id,expires_at,created_at) VALUES(?,?,?,'verified',?,?,?,?)", 'v-' + id, id, 'rev-' + id, options.verifier ?? 'owner', options.verifier ?? 'owner', options.expiresAt === undefined ? null : options.expiresAt, at(-30));
    if (options.changed) {
      await sql("INSERT INTO page_revisions(id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at) VALUES(?,?,?,'autosave','h2','[]',?,?)", 'edit-' + id, id, options.editor ?? 'reader', JSON.stringify({ title: id }), at(-1));
      await sql('UPDATE pages SET working_revision_id=? WHERE id=?', 'edit-' + id, id);
    }
  };
  return { ...base, request, page, verify, at };
}
