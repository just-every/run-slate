import {registerImportErasure} from './retire-custody';
import type {FeatureContext} from '../../app/feature-context';

/** A retained archive is indivisible. Native erasure invalidates its entire
 * import in the caller's transaction. The Kit retires its complete custody
 * and writes its value-free journal in that same transaction. No
 * target rows are deleted here: the native erasure planner owns those effects.
 */
export function prepareEraseImportCustody(ctx:FeatureContext,imports:string,params:unknown[]):D1PreparedStatement[] {
  registerImportErasure(ctx,imports,params);
  const statement=(sql:string,...prefix:unknown[])=>ctx.db.prepare(sql).bind(...prefix,...params);
  return [
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT archive_key,? FROM federation_imports WHERE id IN (${imports}) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT plan_key,? FROM federation_imports WHERE plan_key IS NOT NULL AND id IN (${imports}) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`INSERT INTO content_media_cleanup(storage_key,created_at) SELECT storage_key,? FROM import_objects WHERE import_id IN (${imports}) AND (kind!='media' OR NOT EXISTS(SELECT 1 FROM files f WHERE f.storage_key=import_objects.storage_key AND f.deleted_at IS NULL)) ON CONFLICT DO NOTHING`,ctx.now),
    statement(`DELETE FROM import_native_publications WHERE id IN (SELECT id FROM ik_d1_native_staging WHERE destination IN (${imports}))`),
    statement(`DELETE FROM import_native_targets WHERE import_id IN (${imports})`),
    statement(`UPDATE federation_import_mappings SET source_id='erased:'||id WHERE import_job_id IN (${imports})`),
    statement(`DELETE FROM import_objects WHERE import_id IN (${imports})`),
    statement(`UPDATE federation_imports SET state='deleted',import_generation=import_generation+1,plan_key=NULL,mapping_json='[]',report_json='{"failure":"IMPORT_SOURCE_ERASED","message":"Source content was erased. The retained archive and import recovery history were removed; retry, resume and Undo are unavailable. Other native pages remain."}',counts_json='{}',progress_json='{}',filename='Erased original archive',revision_id=?,updated_at=? WHERE id IN (${imports})`,crypto.randomUUID(),ctx.now),
  ];
}
