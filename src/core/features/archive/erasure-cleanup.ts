import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
/** Only committed erasure plans enqueue keys. Success is confirmed after R2 acknowledges deletion. */
export async function completeErasure(ctx:FeatureContext){
 const deadline=Date.now()+240000;
 for(;;){
  const rows=(await ctx.db.prepare('SELECT storage_key FROM content_media_cleanup ORDER BY created_at LIMIT 100').all<{storage_key:string}>()).results;
  if(!rows.length)return {complete:true as const};
  if(Date.now()>deadline)throw new ApiProblem(503,'ERASURE_PENDING','Data erasure is committed; attachment cleanup is pending. Retry to confirm completion.');
  for(const row of rows){
   try{await ctx.files.delete(row.storage_key);await ctx.db.prepare('DELETE FROM content_media_cleanup WHERE storage_key=?').bind(row.storage_key).run();}
   catch{await ctx.db.prepare("INSERT INTO core_job_failures(id,kind,attempts,state,error_code,updated_at) VALUES('erasure:media','erasure',1,'failed','ERASURE_STORAGE_PENDING',?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1,state='failed',error_code='ERASURE_STORAGE_PENDING',updated_at=excluded.updated_at").bind(ctx.now).run();throw new ApiProblem(503,'ERASURE_PENDING','Data erasure is committed; attachment cleanup failed. Retry to confirm completion.');}
  }
  await ctx.db.prepare("UPDATE core_job_failures SET state='recovered',updated_at=? WHERE id='erasure:media'").bind(ctx.now).run();
 }
}
