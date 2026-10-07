import type {FeatureContext} from '../../app/feature-context';
import {clock,readJob,type PortabilityJob} from './jobs-store';
/** Idempotent on-demand reconciliation. Completed restore originals are never disposable. */
export async function cleanupJob(ctx:FeatureContext,id:string){
 const row=await readJob(ctx,id); // A failed witness read deliberately aborts cleanup.
 if(!row)return;
 const keys=new Set<string>(row.source_archive_key?[row.source_archive_key]:[]);
 if(row.state==='failed')for(const key of JSON.parse(row.cleanup_json) as string[])keys.add(key);
 if(row.state!=='failed'&&row.state!=='completed')return;
 for(const key of keys){
  await ctx.db.prepare('INSERT INTO content_media_cleanup(storage_key,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').bind(key,clock()).run();
  try{await ctx.files.delete(key);if(!await ctx.files.head(key))await ctx.db.prepare('DELETE FROM content_media_cleanup WHERE storage_key=?').bind(key).run();}catch{/* Durable journal remains for the next boundary/native cleanup. */}
 }
 // Keep terminal key tombstones until retention so a late put can be reconciled again.
}
export async function failJob(ctx:FeatureContext,job:PortabilityJob,code:string,message:string){
 const now=clock(),report=JSON.stringify({code,message});
 await ctx.db.batch([
  ctx.db.prepare("UPDATE federation_exports SET state='failed',archive_key=NULL,counts_json='{}',report_json=?,updated_at=? WHERE id=? AND state IN ('queued','running') AND EXISTS(SELECT 1 FROM portability_jobs WHERE id=? AND state IN ('queued','running') AND lease_id IS ?)").bind(report,now,job.id,job.id,job.lease_id),
  ctx.db.prepare("UPDATE portability_jobs SET state='failed',counts_json='{}',report_json=?,lease_id=NULL,lease_until=NULL,completed_at=?,updated_at=? WHERE id=? AND state IN ('queued','running') AND lease_id IS ?").bind(report,now,now,job.id,job.lease_id)
 ]);
 await cleanupJob(ctx,job.id);
}
/** Called only after native authentication and owner verification at a jobs boundary. No scheduler is implied. */
export async function drainJobs(ctx:FeatureContext){
 const now=clock();
 const rows=(await ctx.db.prepare("SELECT * FROM portability_jobs WHERE expires_at<=? OR (state IN ('queued','running') AND lease_until<=?) OR state IN ('failed','completed') ORDER BY CASE WHEN expires_at<=? THEN 0 WHEN state IN ('queued','running') AND lease_until<=? THEN 1 ELSE 2 END,updated_at LIMIT 100").bind(now,now,now,now).all<PortabilityJob>()).results;
 for(const row of rows){
  if(row.expires_at<=now){
   // Atomically fence before any deletion. A successful restore only contributes its source archive.
   await ctx.db.batch([
    ctx.db.prepare("INSERT INTO content_media_cleanup SELECT value,? FROM portability_jobs,json_each(cleanup_json) WHERE portability_jobs.id=? AND NOT(kind='restore' AND state='completed') ON CONFLICT DO NOTHING").bind(now,row.id),
    ctx.db.prepare('INSERT INTO content_media_cleanup SELECT source_archive_key,? FROM portability_jobs WHERE id=? AND source_archive_key IS NOT NULL ON CONFLICT DO NOTHING').bind(now,row.id),
    ctx.db.prepare("UPDATE federation_exports SET state='invalidated',archive_key=NULL,counts_json='{}',report_json='{}',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM portability_jobs WHERE id=?)").bind(now,row.id,row.id),
    ctx.db.prepare('DELETE FROM portability_jobs WHERE id=?').bind(row.id)
   ]);
  }else if((row.state==='running'||(row.state==='queued'&&!row.source_ready))&&row.lease_until&&row.lease_until<=now){await failJob(ctx,row,'INTERRUPTED','The worker stopped before a durable completion. Start a new operation with a fresh key.');}
  else await cleanupJob(ctx,row.id);
 }
 // The existing cleanup queue is durable. Verify physical absence before acknowledging our drain.
 const pending=(await ctx.db.prepare('SELECT storage_key FROM content_media_cleanup LIMIT 100').all<{storage_key:string}>()).results;
 for(const {storage_key:key} of pending){try{await ctx.files.delete(key);if(!await ctx.files.head(key))await ctx.db.prepare('DELETE FROM content_media_cleanup WHERE storage_key=?').bind(key).run();}catch{/* Keep the receipt. */}}
}
