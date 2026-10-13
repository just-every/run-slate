import type {DataRow} from '../portability/archive';
/** Durable import plans, custody receipts and ownership snapshots move together. */
export const reviewedImportTables = ["import_native_targets", "ik_jobs", "ik_original_sets", "ik_originals", "ik_sources", "ik_provenance", "ik_stages", "ik_batches", "ik_targets", "ik_d1_plan_chunks", "ik_d1_original_chunks", "ik_d1_history", "ik_d1_entries", "ik_d1_creation_plans", "ik_d1_reversal_reports", "ik_d1_streams", "ik_d1_stream_pages", "ik_d1_erased_sources", "ik_d1_erased_targets", "ik_d1_indexed_jobs", "ik_d1_plan_index", "ik_d1_stream_origins", "ik_d1_stream_revisions", "ik_d1_publication_fences", "ik_d1_staging", "ik_d1_staging_pages", "ik_d1_staging_chunks", "ik_d1_staging_index", "ik_d1_staging_originals", "ik_d1_custody_revisions", "ik_d1_native_staging", "ik_d1_native_staging_index", "ik_d1_native_staging_values", "ik_d1_custody_states", "ik_d1_preparation_receipts", "ik_d1_staging_headers", "import_native_publications", "import_objects", "import_native_epoch"] as const;
export const importControlTables = ['ik_d1_assertions'] as const;
export function retainedImportObjectKeys(tables:Record<string,DataRow[]>):Set<string> {
  const live=new Set((tables.federation_imports??[]).filter(row=>row.state!=='deleted').map(row=>String(row.id)));
  return new Set((tables.import_objects??[]).filter(row=>live.has(String(row.import_id))&&row.available===1).map(row=>String(row.storage_key)));
}
/** Restoring the captured custody snapshot must not fire live mutation triggers
 * while its interdependent rows are being inserted. The native restore commits
 * both trigger removal and reinstatement in the same transaction. */
export async function importRestoreTriggers(db:D1Database){
  const names=JSON.stringify(reviewedImportTables);
  const rows=(await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name IN (SELECT value FROM json_each(?)) ORDER BY name").bind(names).all<{name:string;sql:string}>()).results;
  return {before:rows.map(row=>db.prepare(`DROP TRIGGER "${row.name.replaceAll('"','""')}"`)),after:rows.map(row=>db.prepare(row.sql))};
}
