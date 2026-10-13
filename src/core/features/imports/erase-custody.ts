import type {FeatureContext} from '../../app/feature-context';

/** A retained archive is indivisible. Native erasure invalidates its entire
 * import in the caller's transaction, removes all reversible plaintext, and
 * retains only the Kit's opaque immutable stream identity tombstones. No
 * target rows are deleted here: the native erasure planner owns those effects.
 */
export function prepareEraseImportCustody(ctx:FeatureContext,imports:string,params:unknown[]):D1PreparedStatement[] {
  const jobs=`SELECT id FROM ik_jobs WHERE destination IN (${imports})`;
  const streams=`SELECT id FROM ik_d1_streams WHERE destination IN (${imports})`;
  const statement=(sql:string,...prefix:unknown[])=>ctx.db.prepare(sql).bind(...prefix,...params);
  return [
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT archive_key,? FROM federation_imports WHERE id IN (${imports}) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT plan_key,? FROM federation_imports WHERE plan_key IS NOT NULL AND id IN (${imports}) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT storage_key,? FROM import_objects WHERE import_id IN (${imports}) AND (kind!='media' OR NOT EXISTS(SELECT 1 FROM files f WHERE f.storage_key=import_objects.storage_key AND f.deleted_at IS NULL)) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`DELETE FROM ik_d1_publication_fences WHERE stream_id IN (${streams})`),
    statement(`UPDATE ik_d1_streams SET state='invalid' WHERE id IN (${streams})`),
    statement(`DELETE FROM import_native_publications WHERE id IN (SELECT id FROM ik_d1_native_staging WHERE destination IN (${imports}))`),
    statement(`DELETE FROM ik_d1_native_staging WHERE destination IN (${imports})`),
    statement(`DELETE FROM ik_d1_staging WHERE destination IN (${imports})`),
    statement(`UPDATE ik_d1_creation_plans SET released=1 WHERE released=0 AND job_id IN (${jobs})`),
    ...['ik_d1_creation_plans','ik_d1_plan_chunks','ik_d1_original_chunks','ik_originals','ik_original_sets','ik_stages','ik_d1_history','ik_provenance','ik_sources','ik_d1_entries','ik_d1_plan_index','ik_d1_indexed_jobs','ik_d1_reversal_reports'].map(table=>statement(`DELETE FROM ${table} WHERE job_id IN (${jobs})`)),
    statement(`UPDATE ik_jobs SET plan_json='{}',state='erased',error=NULL,lease_token=NULL,lease_expires=NULL,fence=fence+1 WHERE id IN (${jobs})`),
    statement(`DELETE FROM ik_targets WHERE destination IN (${imports})`),
    statement(`UPDATE import_native_targets SET value_json='{}' WHERE import_id IN (${imports})`),
    statement(`DELETE FROM import_objects WHERE import_id IN (${imports})`),
    statement(`UPDATE federation_imports SET state='deleted',import_generation=import_generation+1,plan_key=NULL,mapping_json='[]',report_json='{"failure":"IMPORT_SOURCE_ERASED","message":"Source content was erased. The retained archive and import recovery history were removed; retry, resume and Undo are unavailable. Other native pages remain."}',counts_json='{}',progress_json='{}',filename='Erased original archive',revision_id=?,updated_at=? WHERE id IN (${imports})`,crypto.randomUUID(),ctx.now),
  ];
}
