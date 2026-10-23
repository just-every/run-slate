import {z} from 'zod';
import seed from '../../../../../seed.json';
import type {Context} from 'hono';
import type {AppEnvironment} from '../../../app/types';
import {mutationGuard} from '../../../app/operations';
import {ApiProblem} from '../../../app/problems';
import {createUlid} from '../../../shared/ulid';
import {sessionDigest} from '../../../platform/auth/token';
import {prepareRecord} from '../service';
import {refreshSearchIndex} from '../../search/index';
import {availableForm} from './access';
import {formValues} from './definition';
const inputSchema=z.object({submissionKey:z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),expectedRevisionId:z.string().min(1).max(160),title:z.string().trim().min(1).max(1000),values:z.record(z.string(),z.unknown()),website:z.string().default('')}).strict();
const refused=()=>new ApiProblem(400,'FORM_SUBMISSION_REFUSED','This submission could not be accepted.');
export async function submitForm(c:Context<AppEnvironment>,slug:string){
 const form=await availableForm(c,slug),{ctx,row}=form,raw=await c.req.text();
 if(raw.length>65536)throw refused();
 let decoded:unknown;try{decoded=JSON.parse(raw);}catch{throw refused();}
 const parsed=inputSchema.safeParse(decoded);if(!parsed.success)throw new ApiProblem(400,'INVALID_FORM_ANSWER','Complete the visible form questions.');
 const input=parsed.data,seconds=seed.limits.formSubmissionWindowSeconds,bucket=Math.floor(Date.now()/(seconds*1000));
 const key=await sessionDigest(c.get('runtimeConfig').sessionSecret,JSON.stringify({scope:'database-form-address',workspace:row.workspace_id,bucket,address:c.req.header('cf-connecting-ip')??'local'}));
 await ctx.db.prepare('DELETE FROM request_limits WHERE expires_at<=?').bind(ctx.now).run();
 const rate=await ctx.db.prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,new Date((bucket+1)*seconds*1000).toISOString()).first<{count:number}>();
 if(input.website||!rate||rate.count>seed.limits.formSubmissionsPerAddress)throw refused();
 const hash=await sessionDigest(c.get('runtimeConfig').sessionSecret,JSON.stringify({input,memberId:form.memberId}));
 const receipt=()=>ctx.db.prepare('SELECT request_hash FROM database_form_submissions WHERE form_id=? AND submission_key=?').bind(row.id,input.submissionKey).first<{request_hash:string}>();
 const replay=async()=>{const prior=await receipt();if(!prior)return false;if(prior.request_hash!==hash)throw refused();return true;};
 if(await replay())return {accepted:true};
 if(input.expectedRevisionId!==row.revision_id)throw new ApiProblem(409,'FORM_CHANGED','This form changed. Reload before submitting.');
 const values=formValues(form.definition,form.fields,input.values),revisionId=createUlid();
 const record=await prepareRecord(ctx,row.database_id,{operationKey:`form:${row.id}:${input.submissionKey}`,title:input.title,values},revisionId);
 // The real publisher remains the accountable execution actor. Submission
 // provenance supplies the displayed author without granting draft access.
 const statements=[mutationGuard(ctx.db,'SELECT published=1 AND revision_id=? AND publisher_member_id=? FROM database_forms WHERE id=?',[row.revision_id,ctx.actor.id,row.id]),mutationGuard(ctx.db,'SELECT epoch=? FROM core_acl_epoch WHERE id=1',[ctx.authorizationEpoch!]),...record.statements,
 ctx.db.prepare('UPDATE page_revisions SET author_member_id=? WHERE page_id=?').bind(form.memberId,record.value.pageId),ctx.db.prepare('DELETE FROM page_contributors WHERE page_id=?').bind(record.value.pageId),
 ctx.db.prepare('INSERT INTO database_form_submissions(form_id,submission_key,request_hash,record_id,submitter_member_id,submitter_kind,created_at) VALUES(?,?,?,?,?,?,?)').bind(row.id,input.submissionKey,hash,record.value.pageId,form.memberId,form.kind,ctx.now),
 ctx.db.prepare("INSERT INTO activity_entries(id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,operation_key,occurred_at) VALUES(?,?,?,'databases','databases.form-submit','page',?,'{}',?,?)").bind(createUlid(),row.workspace_id,form.memberId,record.value.pageId,`form:${row.id}:${input.submissionKey}`,ctx.now)];
 try{await ctx.db.batch(statements);}catch(cause){if(await replay())return {accepted:true};if(String(cause).includes('core_write_guards'))throw new ApiProblem(409,'FORM_CHANGED','This form changed. Reload before submitting.');throw cause;}
 await refreshSearchIndex(ctx);
 try{await ctx.jobs.send({type:'automation.drain',workspaceId:row.workspace_id});}catch{console.error('form_automation_dispatch_pending');}
 return {accepted:true};
}
