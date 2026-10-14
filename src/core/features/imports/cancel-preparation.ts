import {cancelD1ImportStaging,undoD1ImportStream} from '../../../../modules/import-kit/src/d1/index.ts';
import {mutationGuard} from '../../app/operations';
import {createUlid} from '../../shared/ulid';
import type {ImportRequestContext} from './request-context';
import type {ReviewedJob} from './apply-review';
import {kitContext} from './kit-context';
import {retainedImportReport} from './report-store';
/** Generation changes fence every older Kit or media batch before cancellation.
 * Planned media keys are swept too: R2 puts may precede their SQL checkpoint. */
export async function cancelImportPreparation(ctx:ImportRequestContext,job:ReviewedJob) {
 const context=await kitContext(ctx,job),authorization=context.authorization.predicate('create',job.id),guard=()=>mutationGuard(ctx.db,`SELECT (${authorization.sql})`,authorization.params as (string|number|null)[]);
 const published=await ctx.db.prepare('SELECT id FROM ik_d1_streams WHERE destination=?').bind(job.id).first<{id:string}>();
 if(published){const progress=await undoD1ImportStream(published.id,context);if(progress.state!=='undone')return;}
 await cancelD1ImportStaging(`slate:${job.id}`,context);
 const previous=JSON.parse(job.progress_json??'{}');
 const objects=(await ctx.db.prepare("SELECT storage_key FROM import_objects WHERE import_id=? AND kind='media' AND storage_key>? ORDER BY storage_key LIMIT 8").bind(job.id,previous.cursor??'').all<{storage_key:string}>()).results;
 for(const object of objects){
  const live=await ctx.db.prepare('SELECT 1 FROM files WHERE storage_key=? AND deleted_at IS NULL').bind(object.storage_key).first();
  if(!live)await ctx.files.delete(object.storage_key);
 }
 const done=objects.length<8,report=retainedImportReport(job.report_json);
 report.undo={state:done?'undone':'undoing',conflicts:[],message:'Import cancelled before native publication. The exact original archive remains available.'};
 await ctx.db.batch([guard(),mutationGuard(ctx.db,"SELECT revision_id=? AND state='undoing' FROM federation_imports WHERE id=?",[job.revision_id,job.id]),ctx.db.prepare('UPDATE import_objects SET available=0 WHERE import_id=? AND storage_key IN (SELECT value FROM json_each(?))').bind(job.id,JSON.stringify(objects.map(object=>object.storage_key))),ctx.db.prepare('UPDATE federation_imports SET state=?,report_json=?,progress_json=?,revision_id=?,updated_at=? WHERE id=?').bind(done?'undone':'undoing',JSON.stringify(report),JSON.stringify({phase:'cancel',checkpoint:(previous.checkpoint??0)+objects.length,cursor:objects.at(-1)?.storage_key??previous.cursor??''}),createUlid(),ctx.now,job.id),guard()]);
}
/** A cancelled generation may finish a private R2 put after its sweep. The
 * losing request removes that copy, while protecting every live native file. */
export async function cleanCancelledMedia(ctx:ImportRequestContext,job:ReviewedJob,keys:string[]) {
 const current=await ctx.db.prepare('SELECT import_generation FROM federation_imports WHERE id=?').bind(job.id).first<{import_generation:number}>();
 if(current?.import_generation===job.import_generation)return;
 for(const key of keys){if(!await ctx.db.prepare('SELECT 1 FROM files WHERE storage_key=? AND deleted_at IS NULL').bind(key).first())await ctx.files.delete(key);}
}
