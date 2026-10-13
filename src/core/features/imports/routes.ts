import {startStreamImport} from './upload-stream';
import {readReportSection} from './report-store';
import {PlanTooLargeError} from '../../../../modules/import-kit/src/d1/index.ts';
import {registerActivityResolver} from '../activity/service';
import {Hono,type Context} from 'hono';
import {z} from 'zod';
import type {AppEnvironment} from '../../app/types';
import {featureContext} from '../../app/feature-context';
import {ApiProblem} from '../../app/problems';
import {startImport,runLegacyImport,readImport,deleteImportArchive,recoverImports,type ImportJob} from './jobs';
import {importRequestContext} from './request-context';
import {previewImport} from './preview';
import {applyReviewedImport,undoReviewedImport} from './apply-review';
import {ImportError} from './errors';
const formats=z.enum(['slate-readable','notion-workspace','confluence-space','docx','google-docx','google-html-zip','markdown','html','text','csv','pdf','epub']);
const space=(job:ImportJob)=>job.format==='notion-workspace'||job.format==='confluence-space';
const publicProgress=(job:ImportJob)=>{const {pageIds:_pageIds,...progress}=JSON.parse(job.progress_json??'{}');return progress;};
const view=(job:ImportJob)=>({id:job.id,filename:job.filename,format:job.format,state:job.state,revisionId:job.revision_id,report:JSON.parse(job.report_json),counts:JSON.parse(job.counts_json),progress:publicProgress(job)});
const mappings=z.array(z.object({sourceId:z.string().min(1),kind:z.enum(['member','group']),targetId:z.string().min(1)}));
export function createImportRoutes(){
 registerActivityResolver('import',async(ctx,id)=>{try{await readImport(ctx,id);return true;}catch{return false;}});
 const r=new Hono<AppEnvironment>();
 r.post('/stream',async c=>{
  let metadata:unknown;try{metadata=JSON.parse(decodeURIComponent(c.req.header('X-Import-Metadata')??''));}catch{throw new ApiProblem(400,'IMPORT_METADATA_INVALID','The upload metadata is invalid.');}
  const input=z.object({operationKey:z.string().min(1),format:formats,name:z.string().min(1).max(1024),mediaType:z.string().optional(),sizeBytes:z.number().int().nonnegative(),destination:z.object({pageId:z.string(),expectedRevisionId:z.string(),mode:z.enum(['append','children'])}).optional()}).parse(metadata);
  const body=c.req.raw.body;if(!body)throw new ApiProblem(400,'FILE_REQUIRED','Attach the source archive.');
  return c.json(await startStreamImport(featureContext(c),input,body));
 });
 r.post('/',async c=>{
  const body=await c.req.parseBody(),file=body.file;
  if(!(file instanceof File))throw new ApiProblem(400,'FILE_REQUIRED','Attach the source archive.');
  if(file.size>256*1024*1024)throw new ApiProblem(413,'FILE_TOO_LARGE','Archive limit is 256 MiB.');
  return c.json(await startImport(featureContext(c),{operationKey:z.string().parse(body.operationKey),format:formats.parse(body.format),destination:body.destinationPageId?{pageId:z.string().parse(body.destinationPageId),expectedRevisionId:z.string().parse(body.expectedRevisionId),mode:z.enum(['append','children']).parse(body.mode??'append')}:undefined,source:{name:file.name,mediaType:file.type,bytes:new Uint8Array(await file.arrayBuffer())}}));
 });
 r.get('/',async c=>{
  const ctx=featureContext(c);const rows=(await ctx.db.prepare("SELECT id FROM federation_imports WHERE workspace_id=? AND actor_id=? AND state!='deleted' ORDER BY created_at DESC LIMIT 50").bind(ctx.actor.workspaceId,ctx.actor.id).all<{id:string}>()).results;
  const jobs=[];for(const row of rows)jobs.push(view(await readImport(ctx,row.id)));return c.json({jobs});
 });
 r.post('/recover',async c=>{await recoverImports(featureContext(c));return c.json({recovered:true});});
 r.get('/:id',async c=>c.json(view(await readImport(featureContext(c),c.req.param('id')!))));
 const invoke=async(c:Context<AppEnvironment>,action:'preview'|'apply'|'resume'|'undo'|'run')=>{
  const ctx=featureContext(c),job=await readImport(ctx,c.req.param('id')!);
  try {
   if(job.state==='deleted')throw new ApiProblem(409,'IMPORT_SOURCE_ERASED','The import source and recovery custody were erased.');
   if(!space(job)||job.destination_mode==='append') {
    if(!['run','resume'].includes(action))throw new ApiProblem(409,'IMPORT_ACTION_UNAVAILABLE','Use the document import action for this format.');
    return c.json(view(await runLegacyImport(ctx,job.id)));
   }
   const request=await importRequestContext(c);
   if(action==='preview'||action==='run'&&['queued','failed'].includes(job.state)){
    const body=z.object({mappings:mappings.optional()}).parse(await c.req.json());
    await previewImport(request,job,body.mappings??[]);
   }else if(action==='undo')await undoReviewedImport(request,job);
   else if(action==='apply'){
    const body=z.object({fingerprint:z.string()}).parse(await c.req.json());await applyReviewedImport(request,job,body.fingerprint);
   }else if(action==='resume'){
    if(job.state==='undoing')await undoReviewedImport(request,job);else await applyReviewedImport(request,job);
   }else if(job.state!=='completed')throw new ApiProblem(409,'IMPORT_PREVIEW_REQUIRED','Review this import and choose Apply.');
   return c.json({...view(await readImport(request,job.id)),requestMetrics:{...request.sqlMetrics,...(request.previewTimings?{previewTimings:request.previewTimings}:{})}});
  }catch(error){
   if(error instanceof PlanTooLargeError)throw new ApiProblem(413,error.code,`The reviewed plan is ${error.bytes} canonical bytes; the limit is ${error.limit}.`);
   if(error instanceof ImportError){await ctx.db.prepare("UPDATE federation_imports SET state='failed',report_json=?,updated_at=? WHERE id=? AND (state IN ('queued','preview','failed') OR state='preparing' AND kit_id IS NULL)").bind(JSON.stringify({failure:error.code,message:error.message}),ctx.now,job.id).run();throw new ApiProblem(error.code==='IMPORT_FILE_TOO_LARGE'?413:400,error.code,error.message);}
   console.error('Import operation failed:',error instanceof Error?error.message:'Unknown import failure');throw error;
  }
 };
 for(const action of ['preview','apply','resume','undo','run'] as const)r.post(`/:id/${action}`,c=>invoke(c,action));
 r.get('/:id/report/:section',async c=>{const ctx=featureContext(c),job=await readImport(ctx,c.req.param('id')!);const page=z.coerce.number().int().nonnegative().parse(c.req.query('page')??0);return c.json(await readReportSection(ctx,JSON.parse(job.report_json),c.req.param('section')!,page));});
 r.get('/:id/original',async c=>{const ctx=featureContext(c),job=await readImport(ctx,c.req.param('id')!);if(job.state==='deleted')throw new ApiProblem(404,'NOT_FOUND','Not found.');const file=await ctx.files.get(job.archive_key);if(!file)throw new ApiProblem(404,'NOT_FOUND','Not found.');return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="original-archive"','X-Content-Type-Options':'nosniff'}});});
 r.delete('/:id',async c=>c.json(await deleteImportArchive(featureContext(c),{id:c.req.param('id')!,...z.object({operationKey:z.string(),expectedRevisionId:z.string()}).parse(await c.req.json())})));
 return r;
}
