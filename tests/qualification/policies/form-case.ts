import {applyD1Migrations,env,reset} from 'cloudflare:test';
import {expect} from 'vitest';
import {unzipSync} from 'fflate';
import seed from '../../../seed.json';
import {scenario} from './helpers';
import {seedWorkspace,seedMember,sessionFor} from '../../e2e/setup/fixtures';
import {resetDeployment} from '../../e2e/setup/reset-deployment';
import {createApi} from '../../../src/core/app/hono';
import {scheduledAutomation} from '../../../src/core/features/automation/events';
export async function formCase(){
 const formMigration=env.TEST_MIGRATIONS.findIndex(m=>m.name.includes('database_forms'));
 await reset();await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(0,formMigration));
 const {owner,guest,reader,containerId}=await scenario();
 const api=createApi(),cookies={owner:await sessionFor(owner.actor.id,{freshProof:true}),guest:await sessionFor(guest.actor.id),reader:await sessionFor(reader.actor.id)},runtime={...env,SLATE_PROFILE:undefined};
 const op=()=>crypto.randomUUID();
 const request=(method:string,path:string,body?:unknown,who:'owner'|'guest'|'reader'|'anonymous'='owner',address='192.0.2.21')=>api.request('https://slate.test'+path,{method,headers:{...(who==='anonymous'?{}:{cookie:cookies[who]}),origin:'https://slate.test','cf-connecting-ip':address,...(body instanceof FormData?{}:{'content-type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)},runtime);
 const call=async(method:string,path:string,body?:unknown,who:'owner'|'guest'|'reader'|'anonymous'='owner')=>{const response=await request(method,path,body,who),value=await response.json<any>();expect(response.status,JSON.stringify(value)).toBeLessThan(300);return value;};
 const legacy=(await call('POST','/api/pages',{operationKey:op(),containerId,title:'Procedure retained across the forms upgrade'})).value;
 await applyD1Migrations(env.DB,env.TEST_MIGRATIONS.slice(formMigration));
 expect((await call('GET',`/api/pages/${legacy.pageId}`)).page.title).toBe('Procedure retained across the forms upgrade');
 const db=(await call('POST','/api/databases',{operationKey:op(),containerId,title:'Support requests'})).value;
 for(const [index,field] of [{id:'needs-detail',name:'Needs detail',type:'select',config:{options:['Yes','No']}},{id:'detail',name:'Detail',type:'text',config:{}}].entries()){
  const current=await call('GET',`/api/databases/${db.id}`);await call('POST',`/api/databases/${db.id}/fields`,{operationKey:op(),expectedRevisionId:current.database.revision_id,field:{...field,position:index}});
 }
 const definition={members:true,anonymous:true,guestIds:[guest.actor.id],questions:[{fieldId:'needs-detail',label:'Is more detail needed?',help:'Choose Yes for the follow-up question.',required:true,when:null},{fieldId:'detail',label:'What detail should we know?',help:'Include the handover context.',required:true,when:{fieldId:'needs-detail',equals:'Yes'}}]};
 expect((await request('PUT',`/api/databases/${db.id}/form`,{operationKey:op(),expectedRevisionId:null,title:'Support intake',definition,published:true},'reader')).status).toBe(404);
 const saved=(await call('PUT',`/api/databases/${db.id}/form`,{operationKey:op(),expectedRevisionId:null,title:'Support intake',definition,published:true})).value;
 const form=(await call('GET',`/api/databases/${db.id}/form`)).item;
 expect((await request('GET',saved.href,undefined,'guest')).status).toBe(200);expect((await request('GET',saved.href,undefined,'anonymous')).status).toBe(200);
 const rule=(await call('POST','/api/automation',{operationKey:op(),name:'Record intake acknowledgment',scope:'source',sourceDatabaseId:db.id,trigger:{event:'record-created'},conditions:[],actions:[{type:'comment',body:'Submission received by the support team.'}]})).value;
 const answer=(title:string,values:Record<string,unknown>)=>({submissionKey:op(),expectedRevisionId:form.revisionId,title,values,website:''});
 const guestAnswer=answer('Guest handover',{'needs-detail':'Yes',detail:'Supplier delivery moved to Monday.'});
 await call('POST',saved.href,guestAnswer,'guest');await call('POST',saved.href,guestAnswer,'guest');
 await call('POST',saved.href,answer('Anonymous handover',{'needs-detail':'No'}),'anonymous');
 let records=(await env.DB.prepare('SELECT page_id,field_values_json FROM database_records WHERE database_id=?').bind(db.id).all<{page_id:string;field_values_json:string}>()).results;
 expect(records).toHaveLength(2);expect(records.map(r=>JSON.parse(r.field_values_json))).toEqual(expect.arrayContaining([{'needs-detail':'Yes',detail:'Supplier delivery moved to Monday.'},{'needs-detail':'No'}]));
 const attribution=[];for(const record of records){attribution.push((await call('GET',`/api/pages/${record.page_id}`)).authorDisplayName);expect((await request('GET',`/api/pages/${record.page_id}`,undefined,'guest')).status).toBe(404);}
 expect(attribution).toEqual(expect.arrayContaining(['Guest','Anonymous form']));
 await scheduledAutomation(runtime);await scheduledAutomation(runtime);
 for(const record of records)expect((await call('GET',`/api/comments/page/${record.page_id}`)).comments).toHaveLength(1);
 expect((await call('GET',`/api/automation/${rule.id}/runs`)).items.filter((r:any)=>r.state==='success')).toHaveLength(2);
 expect((await request('POST',saved.href,answer('Hidden value',{'needs-detail':'No',detail:'Should not be accepted'}),'anonymous')).status).toBe(400);
 expect((await request('POST',saved.href,answer('Missing visible answer',{'needs-detail':'Yes'}),'anonymous')).status).toBe(400);
 const honeypot=await request('POST',saved.href,{...answer('Spam',{'needs-detail':'No'}),website:'filled'},'anonymous');const refused=await honeypot.json();
 for(let i=0;i<seed.limits.formSubmissionsPerAddress;i++)await request('POST',saved.href,{...answer('Spam',{'needs-detail':'No'}),website:'filled'},'anonymous');
 const limited=await request('POST',saved.href,answer('Over limit',{'needs-detail':'No'}),'anonymous');expect(limited.status).toBe(honeypot.status);expect(await limited.json()).toEqual(refused);
 expect((await env.DB.prepare('SELECT COUNT(*) n FROM database_records WHERE database_id=?').bind(db.id).first<{n:number}>())!.n).toBe(2);
 const container=await call('GET',`/api/containers/${containerId}`);
 await call('POST','/api/sharing/container-settings',{operationKey:op(),id:containerId,expectedRevisionId:container.revisionId,visibility:'private',guestAccess:'allowed',publicLinkAccess:'forbidden',anonymousAccess:'allowed'});
 expect((await request('GET',saved.href,undefined,'anonymous')).status).toBe(404);expect((await request('POST',saved.href,answer('Closed link',{'needs-detail':'No'}),'anonymous')).status).toBe(404);
 expect((await request('GET',saved.href,undefined,'guest')).status).toBe(200);
 // Full native custody retains definitions and facts, and restore stops public
 // execution until an editor explicitly publishes with fresh authority.
 const ownerEmail=(await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(owner.actor.id).first<{email:string}>())!.email;
 const reminder=(await call('POST','/api/reminders',{operationKey:op(),pageId:legacy.pageId,date:'2027-01-01',time:'12:00',timezone:'UTC'})).value;
 const exported=await call('POST','/api/exports/workspace',{operationKey:op()});
 const bytes=new Uint8Array(await(await request('GET',`/api/exports/${exported.id}/download`)).arrayBuffer()),manifest=JSON.parse(new TextDecoder().decode(unzipSync(bytes)['manifest.json']));
 expect(JSON.parse(manifest.tables.database_forms[0].definition_json)).toEqual(definition);expect(manifest.tables.database_form_submissions).toHaveLength(2);
 expect(JSON.stringify(manifest)).not.toContain('192.0.2.21');
 // Erasing a named submitter removes their identity from the submission facts.
 await call('POST','/api/members/remove',{operationKey:op(),memberId:guest.actor.id,erase:true});
 expect((await env.DB.prepare("SELECT submitter_member_id,submitter_kind FROM database_form_submissions WHERE submitter_kind='former-member'").first())).toEqual({submitter_member_id:null,submitter_kind:'former-member'});
 const doc=await call('GET',`/api/pages/${db.pageId}`);
 await call('POST',`/api/archive/${db.pageId}`,{operationKey:op(),expectedRevisionId:doc.page.revisionId,action:'trash'});
 const erased=await request('POST',`/api/archive/${db.pageId}/permanent-delete`,{operationKey:op(),confirmedPageIds:[db.pageId,...records.map(r=>r.page_id)]});
 expect(erased.status,await erased.text()).toBe(200);
 expect((await env.DB.prepare('SELECT COUNT(*) n FROM database_forms').first<{n:number}>())!.n).toBe(0);expect((await env.DB.prepare('SELECT COUNT(*) n FROM database_form_submissions').first<{n:number}>())!.n).toBe(0);
 await resetDeployment();const fresh=await seedWorkspace(),freshOwner=await seedMember(fresh.workspaceId,{role:'owner',email:ownerEmail,displayName:'Restoring owner',isSetupOwner:true});cookies.owner=await sessionFor(freshOwner.memberId,{freshProof:true});
 const restore=new FormData();restore.set('file',new File([bytes],'forms.zip'));await call('POST','/api/exports/restore',restore);
 cookies.owner=await sessionFor(owner.actor.id,{freshProof:true});
 const restored=(await call('GET',`/api/databases/${db.id}/form`)).item;expect(restored.definition).toEqual(definition);expect(restored.published).toBe(false);expect((await request('GET',saved.href,undefined,'anonymous')).status).toBe(404);
 expect((await env.DB.prepare('SELECT COUNT(*) n FROM database_form_submissions').first<{n:number}>())!.n).toBe(2);expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
 const restoredReminder=(await call('GET','/api/reminders/jobs')).items.find((r:any)=>r.id===reminder.id);expect(restoredReminder).toMatchObject({state:'stopped',dueAt:reminder.dueAt,startedAt:null});
}
