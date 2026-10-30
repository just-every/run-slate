import { after } from 'node:test';
import { captureD1Baseline } from '../../../../tests/support/d1-baseline.mjs';
import { runtimeLease } from '../../../../tests/support/runtime-lease.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from '../../../container/adapters/d1-workerd.mjs';
import { initializeD1ImportStorage, canonicalJson, sha256 } from '../../src/d1/index.ts';
import type { D1TargetAdapter, D1ImportContext, SourceBundle, ImportMapping, TargetRow } from '../../src/d1/index.ts';

const sql = (sql: string, ...params: any[]) => ({ sql, params });
/** Synthetic native adapter exercising two real native tables per effect. */
export const targets: D1TargetAdapter = {
  async read(db, destination, kind, id) {
    const row = await db.prepare('SELECT c.*,e.detail FROM contacts c JOIN evidence e ON e.id=c.id WHERE c.destination=? AND c.kind=? AND c.id=?').bind(destination, kind, id).first();
    if (!row) return undefined;
    return { destination, targetKind: kind, targetId: id, revision: row.revision, value: { email: row.email, evidence: row.detail } };
  },
  matches(row, destination, kind, id) {
    return row ? sql('EXISTS(SELECT 1 FROM contacts c JOIN evidence e ON e.id=c.id WHERE c.destination=? AND c.kind=? AND c.id=? AND c.revision=? AND c.email=? AND e.detail=?)', destination, kind, id, row.revision, (row.value as any).email, (row.value as any).evidence) : sql('NOT EXISTS(SELECT 1 FROM contacts WHERE destination=? AND kind=? AND id=?) AND NOT EXISTS(SELECT 1 FROM evidence WHERE id=?)', destination, kind, id, id);
  },
  matchesCount(count, destination) { return sql('(SELECT COUNT(*) FROM contacts WHERE destination=?)=?', destination, count); },
  write(row) { return [sql('INSERT INTO contacts(destination,kind,id,revision,email) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,email=excluded.email', row.destination, row.targetKind, row.targetId, row.revision, (row.value as any).email), sql('INSERT INTO evidence(id,detail) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET detail=excluded.detail', row.targetId, (row.value as any).evidence)]; },
  remove(destination, kind, id) { return [sql('DELETE FROM evidence WHERE id=?', id), sql('DELETE FROM contacts WHERE destination=? AND kind=? AND id=?', destination, kind, id)]; },
  async list(db, destination) { const { results } = await db.prepare('SELECT kind,id FROM contacts WHERE destination=?').bind(destination).all(); return Promise.all(results.map(r => this.read(db, destination, r.kind, r.id) as Promise<TargetRow>)); }
};
export function source(count = 3): SourceBundle {
  const payloads = Array.from({ length: count }, (_, i) => ({ email: `person${i}@example.test`, evidence: 'historical export' }));
  const bytes = canonicalJson(payloads), hash = sha256(bytes);
  return { diagnostics: [], artifacts: [{ name: 'contacts.json', sha256: hash, size: Buffer.byteLength(bytes), original: { status: 'available', base64: Buffer.from(bytes).toString('base64') } }], records: payloads.map((payload, i) => ({ namespace: 'archive', kind: 'contact', sourceId: String(i), payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: 'contacts.json', row: i + 1 } })) };
}
export const mapping: ImportMapping = { version: 'v1', map: r => ({ effects: [{ targetKind: 'contact', targetId: r.sourceId, value: r.payload }] }) };
const acquire = runtimeLease();
let shared: ReturnType<typeof initializeRuntime> | undefined;
async function initializeRuntime() {
  const directory = await mkdtemp(join(tmpdir(), 'import-d1-'));
  const init = () => new Miniflare({ ...convertV4MiniflareOptions({ modules: true, script: 'export default { fetch(){return new Response("ok")} }', compatibilityDate: '2026-09-01', d1Databases: { DB: 'imports' } }), resourcePersistencePath: join(directory, 'state') });
  let mf: Miniflare;
  try { mf = init(); }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  let db: Awaited<ReturnType<typeof mf.getD1Database>>;
  try {
    db = await mf.getD1Database('DB');
    await initializeD1ImportStorage(db);
    await db.batch(['CREATE TABLE contacts(destination TEXT,kind TEXT,id TEXT PRIMARY KEY,revision TEXT,email TEXT)', 'CREATE TABLE evidence(id TEXT PRIMARY KEY,detail TEXT)', 'CREATE TABLE sessions(id TEXT PRIMARY KEY,actor TEXT,enabled INTEGER,expires INTEGER)', "INSERT INTO sessions VALUES('session','owner',1,9999999999999)"].map(sql => db.prepare(sql)));
    const restore = await captureD1Baseline(db);
    const context = (): D1ImportContext => ({ destination: 'workspace', namespace: 'archive', mappingVersion: 'v1', batchSize: 1, storage: { database: db, targets }, authorization: { principalId: 'owner', predicate: () => sql("EXISTS(SELECT 1 FROM sessions WHERE id=? AND actor=? AND enabled=1 AND expires>unixepoch()*1000)", 'session', 'owner') } });
    return {
      context, db: () => db,
      reset: () => restore(db),
      // Explicit persistence tests still stop workerd and reopen the SAME store.
      async reopen() { await mf.dispose(); mf = init(); db = await mf.getD1Database('DB'); },
      async dispose() { try { await mf.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } },
    };
  } catch (error) {
    try { await mf.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
    throw error;
  }
}
after(async () => { if (shared) await (await shared).dispose(); });
export async function runtime(t: any) {
  const release = await acquire();
  try {
    const instance = await (shared ??= initializeRuntime());
    await instance.reset();
    t.after(release);
    return instance;
  } catch (error) { release(); throw error; }
}
