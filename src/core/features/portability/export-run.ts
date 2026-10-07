import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {safeRow} from './rows';
import {requireExportCoverage} from './coverage';
import {byteHash,encodeArchive,schema,type WorkspaceArchive,type DataRow} from './archive';
import {putTracked,claimGuard,identityGuard,aclGuard,clock,type PortabilityJob} from './jobs-store';
export async function runWorkspaceExport(ctx:FeatureContext,job:PortabilityJob){
 const columns=await schema(ctx.db);const names=Object.keys(columns);const results=await ctx.db.batch(names.map(name=>ctx.db.prepare(`SELECT * FROM "${name}"`)));const tables:Record<string,DataRow[]>={};for(const [n,name]of names.entries())tables[name]=(results[n]!.results as DataRow[]).map(row=>safeRow(name,row));
 const manifest:WorkspaceArchive={version:1,createdAt:ctx.now,tables,columns,blobs:[],reconnect:['Provider credentials are excluded. Reconnect all sources, chat destinations, identity providers, agents and model accounts. Imported automation, AI and guided work stay inactive. Skills retain evaluations but need fresh owner activation; trials need fresh authorization. External effects never replay.']};const blobs:Record<string,Uint8Array>={};const keys=new Set<string>();for(const row of tables.files??[])if(!row.deleted_at)keys.add(String(row.storage_key));for(const row of tables.federation_imports??[])if(row.state!=='deleted')keys.add(String(row.archive_key));let size=0;for(const key of keys){const object=await ctx.files.get(key);if(!object)throw new ApiProblem(409,'MISSING_EXPORT_FILE','A referenced original file is missing.');const bytes=new Uint8Array(await object.arrayBuffer());size+=bytes.length;if(size>256*1024*1024)throw new ApiProblem(413,'ARCHIVE_TOO_LARGE','Export exceeds the bounded archive size.');const entry=`blobs/${manifest.blobs.length}`;blobs[entry]=bytes;manifest.blobs.push({key,entry,hash:await byteHash(bytes),size:bytes.length});}

 await requireExportCoverage(ctx);
 const bytes=await encodeArchive(manifest,blobs),key=`federation/exports/${job.id}/workspace.zip`;
 await putTracked(ctx,job,key,bytes);
 await requireExportCoverage(ctx);
 const counts=Object.fromEntries(Object.entries(tables).map(([table,rows])=>[table,rows.length])),now=clock();
 await ctx.db.batch([claimGuard(ctx,job),identityGuard(ctx),aclGuard(ctx),
  ctx.db.prepare("UPDATE federation_exports SET state='completed',archive_key=?,counts_json=?,updated_at=? WHERE id=? AND state='running'").bind(key,JSON.stringify(counts),now,job.id),
  ctx.db.prepare("UPDATE portability_jobs SET state='completed',counts_json=?,completed_at=?,updated_at=?,lease_id=NULL,lease_until=NULL WHERE id=?").bind(JSON.stringify(counts),now,now,job.id)
 ]);
}
