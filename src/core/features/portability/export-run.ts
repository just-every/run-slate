import {writeWorkspaceArchive} from './archive-stream';
import type {FeatureContext} from '../../app/feature-context';
import {requireExportCoverage} from './coverage';
import {trackPut,assertClaim,reclaimUncommitted,claimGuard,identityGuard,aclGuard,clock,type PortabilityJob} from './jobs-store';
export async function runWorkspaceExport(ctx:FeatureContext,job:PortabilityJob){
 const key=`federation/exports/${job.id}/workspace.zip`;
 await trackPut(ctx,job,key);
 let result:Awaited<ReturnType<typeof writeWorkspaceArchive>>;
 try{result=await writeWorkspaceArchive(ctx,key,()=>assertClaim(ctx,job));await assertClaim(ctx,job);await requireExportCoverage(ctx);}
 catch(error){await reclaimUncommitted(ctx,key);throw error;}
 const counts=result.counts,now=clock();
 await ctx.db.batch([claimGuard(ctx,job),identityGuard(ctx),aclGuard(ctx),
  ctx.db.prepare("UPDATE federation_exports SET state='completed',archive_key=?,counts_json=?,updated_at=? WHERE id=? AND state='running'").bind(key,JSON.stringify(counts),now,job.id),
  ctx.db.prepare("UPDATE portability_jobs SET state='completed',counts_json=?,completed_at=?,updated_at=?,lease_id=NULL,lease_until=NULL WHERE id=?").bind(JSON.stringify(counts),now,now,job.id)
 ]);
}
