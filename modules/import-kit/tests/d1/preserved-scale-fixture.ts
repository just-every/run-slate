import { canonicalJson, sha256, createD1ImportJob, planD1Import } from '../../src/d1/index.ts';
import type { D1ImportContext, D1UndoDisposition, ImportJob, ImportPlan, ImportMapping, SourceBundle, TargetRow } from '../../src/d1/index.ts';
import { effectIdentity } from '../../src/storage/provenance.ts';
import { reportHash, undoEvidence } from '../../src/d1/undo-state.ts';
import { insertJsonRows } from '../../src/d1/sets.ts';
import { prepare, sql } from '../../src/d1/database.ts';
import { sqliteRuntime } from './sqlite-runtime.ts';

/** Two files of 8,500 records, each owning a record and a link effect. */
export function scaleSource(count = 34000): SourceBundle {
  const source: SourceBundle = { artifacts: [], records: [], diagnostics: [] };
  for (let start = 0; start < count / 2; start += 8500) {
    const payloads = Array.from({ length: Math.min(8500, count / 2 - start) }, (_, i) => ({ id: String(start + i), label: 'original' }));
    const bytes = Buffer.from(canonicalJson(payloads)), hash = sha256(bytes), name = `table-${start / 8500}.json`;
    source.artifacts.push({ name, size: bytes.length, sha256: hash, original: { status: 'available', base64: bytes.toString('base64') } });
    source.records.push(...payloads.map((payload, i) => ({ namespace: 'archive', kind: 'record', sourceId: payload.id, payload, payloadHash: sha256(canonicalJson(payload)), artifactHash: hash, location: { artifact: name, row: i + 1 } })));
  }
  return source;
}
export const scaleMapping: ImportMapping = { version: 'v1', map: r => ({ effects: ['record','link'].map(targetKind => ({ targetKind, targetId: r.sourceId, value: r.payload })) }) };

/** Test-only historical state. Public creation retains the exact plan/originals;
 * direct SQL installs completed history without replaying 34,000 apply/undo
 * mutations. The ensuing public calls validate the entire durable closure. */
export async function seedReversal(plan: ImportPlan, job: ImportJob, context: D1ImportContext, reversedCount = 33999) {
  const reports: any[] = [], dispositions: D1UndoDisposition[] = [], provenance: any[] = [], entries: any[] = [], native: any[] = [], claims: any[] = [];
  for (const [ordinal, entry] of plan.entries.entries()) {
    entries.push({ job_id: job.id, ordinal, source_identity: entry.identity, owner_job_id: job.id, effects_hash: sha256(canonicalJson(entry.effects)) });
    let active = false;
    for (const [index, effect] of entry.effects.entries()) {
      const id = effectIdentity(job.id, entry.identity, index), revision = sha256(canonicalJson([job.id, entry.identity, index, 'applied']));
      const applied: TargetRow = { destination: plan.destination, targetKind: effect.targetKind, targetId: effect.targetId, value: effect.value, revision };
      const reversed = provenance.length < reversedCount;
      const p = { id, jobId: job.id, sourceIdentity: entry.identity, sourceKind: entry.source.kind, sourceId: entry.source.sourceId, sourceHash: entry.source.payloadHash, artifactHash: entry.source.artifactHash, location: entry.source.location, destination: plan.destination, targetKind: effect.targetKind, targetId: effect.targetId, valueHash: sha256(canonicalJson(effect.value)), attachmentHash: null, appliedRevision: revision, before: null, reversed };
      provenance.push({ id, job_id: job.id, ordinal, effect_ordinal: index, source_identity: entry.identity, destination: plan.destination, target_kind: effect.targetKind, target_id: effect.targetId, reversed: Number(reversed), record_json: canonicalJson(p) });
      if (reversed) {
        const evidence = undoEvidence(applied, context);
        const d: D1UndoDisposition = { jobId: job.id, effectId: id, targetKind: effect.targetKind, targetId: effect.targetId, entity: { table: 'native_records', recordId: effect.targetId }, disposition: 'reversed', reason: 'unchanged', expected: evidence, observed: evidence, protectedBy: [], evidence: null };
        reports.push({ job_id: job.id, effect_id: id, position: reports.length, record_json: canonicalJson(d) }); dispositions.push(d);
      } else {
        active = true;
        native.push({ destination: plan.destination, kind: effect.targetKind, id: effect.targetId, revision, value_json: canonicalJson(effect.value) });
      }
    }
    if (active) claims.push({ identity: entry.identity, source_hash: entry.source.payloadHash, mapping_version: plan.mappingVersion, effects_hash: sha256(canonicalJson(entry.effects)), job_id: job.id });
  }
  // Keep the journal shaped like bounded public batches even though setup
  // installs it directly: 25 source entries / 50 native effects per batch.
  const batches: any[] = []; let fence = 0;
  for (let position = 0; position < plan.entries.length; position += 25) batches.push({ job_id: job.id, action: 'apply', position, end_position: Math.min(position + 25, plan.entries.length), fence: ++fence });
  if (reports.length) {
    fence++; // Durable reversal intent.
    for (let position = 0; position < reports.length; position += 50) {
      batches.push({ job_id: job.id, action: 'undo', position: fence, end_position: fence + 1, fence: fence + 1 }); fence++;
    }
  }
  const tables = { ik_d1_entries: entries, ik_provenance: provenance, native_records: native, ik_sources: claims, ik_d1_reversal_reports: reports, ik_batches: batches };
  const statements = Object.entries(tables).flatMap(([table, rows]) => rows.length ? insertJsonRows(table, Object.keys(rows[0]), rows) : []);
  statements.push(sql('UPDATE ik_jobs SET state=?,checkpoint=total,fence=?,reversal_cursor=?,reversal_hash=? WHERE id=?', reports.length ? 'undoing' : 'completed', fence, reports.length, reportHash(reports), job.id));
  await context.storage.database.batch(statements.map(statement => prepare(context.storage.database, statement)));
  return { reports, dispositions };
}

export async function largeReversal(t: any, count = 34000) {
  const runtime = await sqliteRuntime(t), context = { ...runtime.context(), reversalPolicy: 'preserve-conflicts' as const };
  const plan = await planD1Import(scaleSource(count), scaleMapping, context), job = await createD1ImportJob(plan, { ...context, reviewedFingerprint: plan.fingerprint });
  const seeded = await seedReversal(plan, job, context, count - 1);
  return { ...runtime, job, plan, ...seeded, context: (): D1ImportContext => ({ ...runtime.context(), reversalPolicy: 'preserve-conflicts' }) };
}
