import type {FeatureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {mutationGuard,requestHash} from '../../app/operations';
import {requireWorkspaceOwner} from '../sharing/current-access';
import {prepareSearchRestoreStatements} from '../search/restore-index';
import {restoredRow} from './rows';
import {byteHash} from './archive';
import {prepareRestore,emptyTargetSelects,requireEmptyRestoreTarget} from './restore-plan';
import {putTracked,claimGuard,identityGuard,aclGuard,clock,type PortabilityJob} from './jobs-store';
export async function runWorkspaceRestore(ctx:FeatureContext,job:PortabilityJob){
 const source=await ctx.files.get(job.source_archive_key!);
 if(!source)throw new ApiProblem(409,'MISSING_RESTORE_SOURCE','The staged archive is unavailable.');
 const bytes=new Uint8Array(await source.arrayBuffer());
 if(await requestHash({kind:'restore',archive:await byteHash(bytes)})!==job.request_hash)throw new ApiProblem(409,'STAGED_ARCHIVE_CHANGED','The staged archive no longer matches the admitted request.');
 const {owner,manifest,entries,columns,restoredOwner}=await prepareRestore(ctx,bytes);
 const keys=new Map<string,string>();
 for(const blob of manifest.blobs){const key=`federation/restore/${job.planned_restore_id}/${blob.entry}`;await putTracked(ctx,job,key,entries[blob.entry]!,()=>requireEmptyRestoreTarget(ctx));keys.set(blob.key,key);}
 await requireWorkspaceOwner(ctx);
 const now=clock(),counts=JSON.stringify(Object.fromEntries(Object.entries(manifest.tables).map(([name,rows])=>[name,rows.length])));
 const statements=[ctx.db.prepare('PRAGMA defer_foreign_keys=ON'),claimGuard(ctx,job),identityGuard(ctx),aclGuard(ctx),
  mutationGuard(ctx.db,'SELECT is_setup_owner=1 AND email=? FROM members WHERE id=?',[owner.email,ctx.actor.id]),
  ...emptyTargetSelects.map(sql=>mutationGuard(ctx.db,sql,[])),ctx.db.prepare('DELETE FROM sessions'),ctx.db.prepare('DELETE FROM members'),ctx.db.prepare('DELETE FROM workspace_policies'),ctx.db.prepare('DELETE FROM workspaces')];
 for(const name of Object.keys(manifest.tables))for(const original of manifest.tables[name]!){
  const row=restoredRow(name,original,owner.email,now,keys),names=columns[name]!;
  statements.push(ctx.db.prepare(`INSERT ${name==='content_published_revisions'?'OR IGNORE ':''}INTO "${name}" (${names.map(n=>`"${n}"`).join(',')}) VALUES (${names.map(()=>'?').join(',')})`).bind(...names.map(n=>row[n]??null)));
 }
 statements.push(...prepareSearchRestoreStatements(ctx.db,manifest.tables));
 // Journal the disposable input in the same commit as workspace replacement.
 // Recovery must not depend on a response, witness read, or terminal-receipt scan.
 statements.push(ctx.db.prepare('INSERT INTO content_media_cleanup(storage_key,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').bind(job.source_archive_key,now));
 statements.push(ctx.db.prepare("UPDATE portability_jobs SET state='completed',status_workspace_id=?,status_actor_id=?,counts_json=?,completed_at=?,updated_at=?,cleanup_json='[]',lease_id=NULL,lease_until=NULL WHERE id=?").bind(restoredOwner.workspace_id,restoredOwner.id,counts,now,now,job.id));
 // Canonical rows, native session reset, search, receipt and status remapping share one commit.
 await ctx.db.batch(statements);
}
