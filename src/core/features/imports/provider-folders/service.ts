import {finishFolderIndex} from './indexing';
import {folderFingerprint,emptyFolderReport} from './preview';
import type {FeatureContext} from '../../../app/feature-context';
import {ApiProblem} from '../../../app/problems';
import {commitOperation,mutationGuard,requestHash} from '../../../app/operations';
import {createUlid} from '../../../shared/ulid';
import {currentSubject,requirePageLevel} from '../../sharing/current-access';
import {identityRevision} from '../../workspace/revisions';
import {prepareImportPlan} from '../persist';
import {connectionGuard,openFolderConnection,policyGuard,requireEnabled} from './connections';
import {collectFolder} from './traverse';
import type {FolderReport} from './types';
interface FolderRun {id:string;state:string;report_json:string;revision_id:string;request_hash:string;source_folder_id:string;destination_page_id:string;provider:string}
export async function readFolderRun(ctx:FeatureContext,id:string){await currentSubject(ctx);let row=await ctx.db.prepare('SELECT r.id,r.state,r.report_json,r.revision_id,r.request_hash,r.source_folder_id,r.destination_page_id,c.provider FROM provider_folder_runs r JOIN provider_folder_connections c ON c.id=r.connection_id WHERE r.id=? AND r.workspace_id=? AND r.actor_id=?').bind(id,ctx.actor.workspaceId,ctx.actor.id).first<FolderRun>();if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');if(row.state==='indexing'){await finishFolderIndex(ctx,id,row.revision_id);row=(await ctx.db.prepare('SELECT r.id,r.state,r.report_json,r.revision_id,r.request_hash,r.source_folder_id,r.destination_page_id,c.provider FROM provider_folder_runs r JOIN provider_folder_connections c ON c.id=r.connection_id WHERE r.id=? AND r.workspace_id=? AND r.actor_id=?').bind(id,ctx.actor.workspaceId,ctx.actor.id).first<FolderRun>())!;if(!row)throw new ApiProblem(404,'NOT_FOUND','Not found.');}return {id:row.id,state:row.state,report:JSON.parse(row.report_json) as FolderReport,revisionId:row.revision_id,provider:row.provider,folderId:row.source_folder_id,destinationPageId:row.destination_page_id};}
export async function importProviderFolder(ctx:FeatureContext,input:{operationKey:string;connectionId:string;folderId:string;destination:{pageId:string;expectedRevisionId:string};previewFingerprint:string}){
 const {row,adapter}=await openFolderConnection(ctx,input.connectionId);await requirePageLevel(ctx,input.destination.pageId,'edit');
 const hash=await requestHash(input),prior=await ctx.db.prepare('SELECT id,request_hash FROM provider_folder_runs WHERE workspace_id=? AND actor_id=? AND operation_key=?').bind(ctx.actor.workspaceId,ctx.actor.id,input.operationKey).first<{id:string;request_hash:string;source_folder_id:string;destination_page_id:string;provider:string}>();if(prior){if(prior.request_hash!==hash)throw new ApiProblem(409,'OPERATION_KEY_CONFLICT','The operation key names another import.');return readFolderRun(ctx,prior.id);}
 const id=createUlid(),claim=createUlid(),report:FolderReport=emptyFolderReport();
 const authorize=async()=>{await requireEnabled(ctx,row.provider);await requirePageLevel(ctx,input.destination.pageId,'edit');};
 await commitOperation(ctx,{operationKey:`folder-admit:${hash.slice(0,48)}`,action:'imports.folder-admit',request:{id,input},authorize,prepare:async()=>({entity:{id,kind:'import',revisionId:claim},value:{id},statements:[policyGuard(ctx,row.provider),connectionGuard(ctx,row),ctx.db.prepare("INSERT INTO provider_folder_runs (id,workspace_id,actor_id,connection_id,operation_key,request_hash,source_folder_id,destination_page_id,state,report_json,revision_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'running',?,?,?,?)").bind(id,ctx.actor.workspaceId,ctx.actor.id,row.id,input.operationKey,hash,input.folderId,input.destination.pageId,JSON.stringify(report),claim,ctx.now,ctx.now)]})});
 let staged:string[]=[],published=false;
 try{
  const parsed=await collectFolder(adapter,input.folderId,report);
  report.counts={pages:parsed.pages.length,documents:report.imported.length,files:parsed.media.length};
  if(await folderFingerprint(input,parsed,report)!==input.previewFingerprint)throw new ApiProblem(409,'FOLDER_PREVIEW_CHANGED','The folder changed after preview. Preview it again before importing.');
  const plan=await prepareImportPlan(ctx,id,parsed,input.destination);staged=plan.stagedKeys;
  // A delegated credential is checked again immediately before atomic publication.
  await openFolderConnection(ctx,row.id);report.counts=plan.counts;
  for(const imported of report.imported)imported.pageId=parsed.report.created.find(entry=>entry.sourceId===imported.sourceId)?.targetId;
  const mappings=plan.statements;
  await commitOperation(ctx,{operationKey:`folder-publish:${id}`,action:'imports.folder-publish',request:{id,hash},commit:async statements=>{await ctx.db.batch(statements);published=true;},authorize:async()=>{await authorize();await plan.authorize();},prepare:async({revisionId})=>({entity:{id,kind:'import',revisionId},value:{id,state:'indexing'},statements:[policyGuard(ctx,row.provider),connectionGuard(ctx,row),mutationGuard(ctx.db,"SELECT state='running' AND revision_id=? FROM provider_folder_runs WHERE id=?",[claim,id]),...mappings,await identityRevision(ctx,revisionId,'import',id,{state:'indexing',counts:plan.counts}),ctx.db.prepare("UPDATE provider_folder_runs SET state='indexing',report_json=?,revision_id=?,updated_at=? WHERE id=?").bind(JSON.stringify(report),revisionId,ctx.now,id)]})});

 }catch(error){if(published)throw error;for(const key of staged)await ctx.files.delete(key);await ctx.db.prepare("UPDATE provider_folder_runs SET state='failed',report_json=?,updated_at=? WHERE id=? AND state='running' AND revision_id=?").bind(JSON.stringify({...report,failure:error instanceof ApiProblem?error.code:'FOLDER_IMPORT_FAILED'}),ctx.now,id,claim).run();throw error;}
 return readFolderRun(ctx,id);
}
