import {env} from 'cloudflare:test';
import {expect,vi} from 'vitest';
import {createApi} from '../../src/core/app/hono';
import {scheduledDiscovery} from '../../src/core/features/notifications/jobs';
import {workItems} from './work-items-journey';
import {createUlid} from '../../src/core/shared/ulid';
type Items=Awaited<ReturnType<typeof workItems>>;
const origin='https://slate.example';
const sender=['synthetic-slate-sender','test.invalid'].join('@');
const bindings={...env,APP_URL:origin,LOCAL_DEVELOPMENT:'false',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-slate-1',MAIL_FROM:sender};
interface Envelope {from:string;to:string[];subject:string;text:string;headers?:Record<string,string>;at:string}
export async function emailEdge(run:(messages:Envelope[],send:(at?:string)=>Promise<void>)=>Promise<void>){
 const messages:Envelope[]=[];
 const provider=vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  expect(String(input)).toBe('https://api.resend.com/emails');
  const message=JSON.parse(String(init?.body));expect(message.from).toBe(sender);
  expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^slate-notification:/);
  messages.push({...message,at:new Date().toISOString()});return Response.json({id:`synthetic-slate-${messages.length}`});
 });
 const send=async(at=new Date().toISOString())=>{vi.setSystemTime(new Date(at));await scheduledDiscovery(bindings,at);};
 try{await run(messages,send);}finally{provider.mockRestore();}
}
const ok=async(items:Items,method:string,path:string,body?:unknown,actor=items.ownerId)=>{const result=await items.request(method,path,body,actor);expect(result.status,JSON.stringify(result.data)).toBe(200);return result.data;};
const preference=(items:Items,event:string,mode:string,actor=items.reader)=>ok(items,'PUT','/api/notifications/preferences',{operationKey:createUlid(),event,mode},actor);
const lines=(message:Envelope)=>message.text.split('\n').filter(line=>line.startsWith('- '));
const noBody=(messages:Envelope[])=>{for(const message of messages){expect(message.text).not.toContain('synthetic-slate-private');expect(message.text).not.toContain('synthetic-slate-comment-body');}};

/** NOTIF-005 1 to 3 and 6: native choices, comments, watched edits and container events. */
export async function notificationEmailJourney(items:Items){
 const {reader,other,ownerId,workspaceId,create,share}=items;
 expect((await ok(items,'GET','/api/profile')).profile).toBe('core-wiki');
 const initial=await ok(items,'GET','/api/notifications/preferences',undefined,reader);
 expect(initial.items.every((item:{mode:string})=>item.mode==='default')).toBe(true);expect(initial.sectionNames).toBe(false);
 await emailEdge(async(messages,send)=>{
  const defaultPage=await create('Default in-app notice');await share(defaultPage.pageId,other,false,undefined,'comment');
  await ok(items,'PUT','/api/navigation/watches',{operationKey:createUlid(),pageId:defaultPage.pageId,enabled:true},other);
  await ok(items,'POST',`/api/comments/page/${defaultPage.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
  await send();expect(messages).toHaveLength(0);expect((await ok(items,'GET','/api/notifications',undefined,other)).items.some((item:{event:string})=>item.event==='comment')).toBe(true);
  await preference(items,'comment','daily');
  const pages=[];
  for(let index=0;index<8;index++){
   const page=await create(`Digest item ${index+1}`);pages.push(page);
   const grant=await share(page.pageId,reader,false,undefined,'comment');
   await ok(items,'PUT','/api/navigation/watches',{operationKey:createUlid(),pageId:page.pageId,enabled:true},reader);
   await ok(items,'POST',`/api/comments/page/${page.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
   if(index===7)await share(page.pageId,reader,true,grant);
  }
  expect((await ok(items,'GET','/api/notifications',undefined,reader)).items.filter((item:{event:string})=>item.event==='comment')).toHaveLength(7);
  await send('2026-10-19T08:59:59.000Z');expect(messages).toHaveLength(0);
  await Promise.all([send('2026-10-19T09:00:00.000Z'),send('2026-10-19T09:00:00.000Z')]);
  expect(messages).toHaveLength(1);expect(lines(messages[0]!)).toHaveLength(7);expect(messages[0]!.subject).toContain('7 items');
  for(let index=1;index<=7;index++){expect(messages[0]!.text).toContain(`Digest item ${index}`);}expect(messages[0]!.text).not.toContain('Digest item 8');
  expect(messages[0]!.text).toContain('Profile Owner');expect(messages[0]!.text).toContain('/app/pages/');noBody(messages);
  const unsubscribe=messages[0]!.text.match(/Unsubscribe: (https:\/\/\S+)/)![1]!;
  const api=createApi(),result=await api.request(unsubscribe,{},env);expect(result.status).toBe(200);expect(await result.json()).toMatchObject({unsubscribed:true});
  expect((await ok(items,'GET','/api/notifications/preferences',undefined,reader)).items.find((item:{event:string})=>item.event==='comment').mode).toBe('in-app');
  expect((await api.request(unsubscribe,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'},env)).status).toBe(200);
  expect((await api.request(origin+'/api/notifications/unsubscribe?token='+('0'.repeat(64)),{},env)).status).toBe(404);
  await ok(items,'POST',`/api/comments/page/${pages[0]!.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
  await send('2026-10-20T09:00:00.000Z');expect(messages).toHaveLength(1);
  expect((await ok(items,'GET','/api/notifications',undefined,reader)).items.filter((item:{event:string})=>item.event==='comment')).toHaveLength(8);

  // The settings door cannot edit another person's preference or expose the owner switch to a member.
  expect((await items.request('PUT','/api/notifications/preferences',{operationKey:createUlid(),event:'mention',mode:'immediate',memberId:ownerId},reader)).status).toBe(400);
  expect((await items.request('PUT','/api/notifications/email-settings',{operationKey:createUlid(),sectionNames:true},reader)).status).toBe(403);
  await preference(items,'page-edited','immediate');
  const summary=await create('Change summary');await share(summary.pageId,reader,false,undefined,'view');
  const blocks=[{id:createUlid(),blockType:'heading',treePosition:'1',content:{level:1,text:[{text:'Rollout plan'}]}},...Array.from({length:3},(_,i)=>({id:createUlid(),blockType:'paragraph',treePosition:String(i+2),content:{text:[{text:`synthetic-slate-private-${i}`} ]}}))];
  await ok(items,'PUT',`/api/pages/${summary.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:summary.revisionId,blocks});
  await ok(items,'PUT','/api/navigation/watches',{operationKey:createUlid(),pageId:summary.pageId,enabled:true},reader);
  const change=async(suffix:string)=>{const page=await ok(items,'GET',`/api/pages/${summary.pageId}`);await ok(items,'PUT',`/api/pages/${summary.pageId}/blocks`,{operationKey:createUlid(),expectedRevisionId:page.page.revisionId,blocks:blocks.map((block,index)=>index?{...block,content:{text:[{text:`synthetic-slate-private-${suffix}-${index}`} ]}}:block)});};
  vi.setSystemTime(new Date('2026-10-20T09:06:00.000Z'));await change('first');await send();expect(messages).toHaveLength(1);await send('2026-10-20T09:11:00.000Z');
  expect(messages).toHaveLength(2);expect(messages[1]!.text).toContain('3 blocks changed');expect(messages[1]!.text).not.toContain('Rollout plan');
  await ok(items,'PUT','/api/notifications/email-settings',{operationKey:createUlid(),sectionNames:true});
  vi.setSystemTime(new Date('2026-10-20T09:12:00.000Z'));await change('second');await send('2026-10-20T09:17:00.000Z');
  expect(messages).toHaveLength(3);expect(messages[2]!.text).toContain('3 blocks changed in Rollout plan');noBody(messages);

  await preference(items,'page-edited','in-app');
  // One container watcher, also watching the page, gets exactly four digest lines.
  const container=(await ok(items,'POST','/api/containers',{operationKey:createUlid(),name:'Digest space',visibility:'private'})).value.id;
  await ok(items,'POST','/api/sharing',{operationKey:createUlid(),targetKind:'container',targetId:container,principalKind:'member',principalId:reader,level:'comment'});
  await ok(items,'PUT','/api/navigation/container-watches',{operationKey:createUlid(),containerId:container,enabled:true},reader);
  for(const event of ['page-created','page-edited','comment'])await preference(items,event,'daily');
  vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
  const watched=await create('Container digest page',{containerId:container});
  const edit=async(labels:string[])=>{const page=await ok(items,'GET',`/api/pages/${watched.pageId}`);await ok(items,'PATCH',`/api/pages/${watched.pageId}`,{operationKey:createUlid(),expectedRevisionId:page.page.revisionId,properties:{labels}});};
  await edit(['first']);await edit(['first','same-session']);
  vi.setSystemTime(new Date('2026-10-20T12:06:00.000Z'));await edit(['second-session']);
  await ok(items,'PUT','/api/navigation/watches',{operationKey:createUlid(),pageId:watched.pageId,enabled:true},reader);
  await ok(items,'POST',`/api/comments/page/${watched.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
  const hidden=await create('Restricted digest page',{containerId:container});
  await share(hidden.pageId,ownerId,false,undefined,'full');
  const doc=await ok(items,'GET',`/api/pages/${hidden.pageId}`);
  await ok(items,'PUT',`/api/sharing/pages/${hidden.pageId}/inheritance`,{operationKey:createUlid(),expectedRevisionId:doc.page.revisionId,restricted:true});
  // Creation was readable at origin but restricted before the send; neither it nor its edits may leak.
  await ok(items,'POST',`/api/comments/page/${hidden.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
  await send('2026-10-21T09:00:00.000Z');expect(messages).toHaveLength(4);
  const digest=messages[3]!;expect(lines(digest)).toHaveLength(4);expect(digest.text).not.toContain('Restricted digest page');
  expect(lines(digest).filter(line=>line.startsWith('- page created'))).toHaveLength(1);expect(lines(digest).filter(line=>line.startsWith('- page edited'))).toHaveLength(2);expect(lines(digest).filter(line=>line.startsWith('- comment'))).toHaveLength(1);noBody(messages);
  await send('2026-10-21T09:00:00.000Z');expect(messages).toHaveLength(4);
  const personal=await ok(items,'GET','/api/navigation/preferences',undefined,reader);
  await ok(items,'PUT','/api/navigation/preferences',{operationKey:createUlid(),expectedRevisionId:personal.revisionId,value:{...personal.value,timezone:'Pacific/Honolulu'}},reader);
  await preference(items,'comment','weekly');
  await ok(items,'POST',`/api/comments/page/${watched.pageId}`,{operationKey:createUlid(),body:[{text:'synthetic-slate-comment-body'}]});
  await send('2026-10-26T18:59:59.000Z');expect(messages).toHaveLength(4);
  await send('2026-10-26T19:00:00.000Z');expect(messages).toHaveLength(5);expect(messages[4]!.subject).toContain('weekly digest');expect(lines(messages[4]!)).toHaveLength(1);noBody(messages);
 });
}

export async function taskAssignmentEmailJourney(items:Items){
 const {reader,other,create,share}=items;
 await emailEdge(async(messages,send)=>{
  for(const member of [reader,other])await preference(items,'task-assigned','immediate',member);
  const page=await create('Assignment email');await share(page.pageId,reader);await share(page.pageId,other);
  const block={id:createUlid(),blockType:'task',treePosition:'1',content:{text:[{text:'synthetic-slate-private-task'}],done:false,assigneeMemberId:reader,dueDate:null}};
  const write={operationKey:createUlid(),expectedRevisionId:page.revisionId,blocks:[block]};
  await ok(items,'PUT',`/api/pages/${page.pageId}/blocks`,write);await ok(items,'PUT',`/api/pages/${page.pageId}/blocks`,write);
  await Promise.all([send(),send()]);expect(messages).toHaveLength(1);expect(messages[0]!.text).toContain('task assigned');expect(lines(messages[0]!)).toHaveLength(1);
  const firstRecipient=messages[0]!.to;
  expect(firstRecipient).toEqual([await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(reader).first<string>('email')]);
  let doc=await ok(items,'GET',`/api/pages/${page.pageId}`);
  await ok(items,'PATCH',`/api/pages/${page.pageId}/blocks/${block.id}`,{operationKey:createUlid(),expectedRevisionId:doc.blocks[0].revisionId,content:{...block.content,assigneeMemberId:other}});
  await send();expect(messages).toHaveLength(2);expect(messages[1]!.to).not.toEqual(firstRecipient);expect(messages[1]!.to).toEqual([await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(other).first<string>('email')]);
  doc=await ok(items,'GET',`/api/pages/${page.pageId}`,undefined,other);
  await ok(items,'PATCH',`/api/pages/${page.pageId}/blocks/${block.id}`,{operationKey:createUlid(),expectedRevisionId:doc.blocks[0].revisionId,content:{...doc.blocks[0].content,done:true}},other);
  await send();expect(messages).toHaveLength(2);noBody(messages);
 });
}
export async function reminderEmailJourney(items:Items){
 const {reader,create,share}=items;
 await emailEdge(async(messages,send)=>{
  await preference(items,'reminder','immediate');
  const allowed=await create('Local reminder email'),denied=await create('Revoked reminder email');
  await share(allowed.pageId,reader,false,undefined,'view');const grant=await share(denied.pageId,reader,false,undefined,'view');
  for(const page of [allowed,denied])await ok(items,'POST','/api/reminders',{operationKey:createUlid(),pageId:page.pageId,date:'2026-10-22',time:'09:00',timezone:'Asia/Kolkata'},reader);
  await share(denied.pageId,reader,true,grant);
  await send('2026-10-22T03:29:59.000Z');expect(messages).toHaveLength(0);
  await Promise.all([send('2026-10-22T03:30:00.000Z'),send('2026-10-22T03:30:00.000Z')]);
  expect(messages).toHaveLength(1);expect(messages[0]!.at).toBe('2026-10-22T03:30:00.000Z');expect(messages[0]!.text).toContain('Local reminder email');expect(messages[0]!.text).not.toContain('Revoked reminder email');
  await send('2026-10-22T03:31:00.000Z');expect(messages).toHaveLength(1);noBody(messages);
 });
}
