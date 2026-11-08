import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';

/** One native action corpus, shared by the loaded Worker and emitted browser journeys. */
export async function activityCoverageProof(door) {
 const {ownerId,memberId,containerId,workspaceId,key}=door;
 const receipts=[],refusals=[],unchanged=[];
 const read=async(path,actor=ownerId)=>{
  const r=await door.request('GET',path,undefined,actor);
  assert.equal(r.status,200,`${path}: ${JSON.stringify(r.data)}`);return r.data;
 };
 const entries=async(params,actor=ownerId)=>{
  const items=[];let cursor;
  do {const data=await read('/api/activity?'+new URLSearchParams({...params,limit:'100',...(cursor?{cursor}:{})}),actor);items.push(...data.items);cursor=data.nextCursor;}while(cursor);
  return items;
 };
 const assertRow=async(record)=>{
  const rows=(await entries({action:record.action,actorId:record.actorId,kind:record.target.kind},record.actorId)).filter(row=>row.operationKey===record.receipt.operationKey);
  assert.equal(rows.length,1,`${record.family}: exactly one activity for its operation key`);
  const row=rows[0];assert.equal(row.id,record.receipt.activityId);
  assert.equal(row.action,record.action);assert.deepEqual(row.target,record.target);
  assert.equal(row.actor.id,record.actorId);assert.equal(row.occurredAt,record.receipt.committedAt);
  assert.ok(Number.isFinite(Date.parse(row.occurredAt)));return row;
 };
 const mutate=async(family,action,method,path,body,target,actorId=ownerId)=>{
  const input={operationKey:key(),...body},response=await door.request(method,path,input,actorId);
  assert.ok(response.status>=200&&response.status<300,`${family}: ${response.status} ${JSON.stringify(response.data)}`);
  const result=response.data,entity=typeof target==='function'?target(result):target;
  assert.equal(result.receipt.operationKey,input.operationKey);assert.ok(result.receipt.activityId,`${family}: changed action has activity`);
  const record={family,action,actorId,target:entity,receipt:result.receipt};
  await assertRow(record);
  const replay=await door.request(method,path,input,actorId);
  assert.equal(replay.status,response.status,`${family}: retry status`);assert.deepEqual(replay.data,result,`${family}: stable receipt`);
  await assertRow(record);receipts.push(record);return result;
 };
 const revision=async(id,actor=ownerId)=>(await read(`/api/pages/${id}`,actor)).page.revisionId;
 const pageTarget=id=>({kind:'page',id});
 const create=async(title,actor=ownerId)=>mutate('page creation','pages.create','POST','/api/pages',{containerId,title},r=>pageTarget(r.value.pageId),actor);
 const shared=await mutate('container member grant','sharing.grant','POST','/api/sharing',{targetKind:'container',targetId:containerId,principalKind:'member',principalId:memberId,level:'full'},{kind:'container',id:containerId});
 for(const level of ['edit','full'])await mutate('container grant change','sharing.grant','POST','/api/sharing',{targetKind:'container',targetId:containerId,id:shared.value.id,principalKind:'member',principalId:memberId,level},{kind:'container',id:containerId});
 const created=await create('synthetic-slate-coverage',memberId),id=created.value.pageId;
 const initial=created.receipt.revisionId;
 await mutate('member body change','pages.blocks.replace','PUT',`/api/pages/${id}/blocks`,{expectedRevisionId:await revision(id),blocks:[{id:key(),blockType:'paragraph',treePosition:'1',content:{text:[{text:'synthetic-slate-audited-body'}]}}]},pageTarget(id),memberId);
 await mutate('owner property change','pages.update','PATCH',`/api/pages/${id}`,{expectedRevisionId:await revision(id),properties:{title:'synthetic-slate-audited-properties',labels:['synthetic-slate-label']}},pageTarget(id));
 // An unchanged native write and a stale captured write both leave the timeline unchanged.
 const sameKey=key(),sameRevision=await revision(id);
 const same=await door.request('PATCH',`/api/pages/${id}`,{operationKey:sameKey,expectedRevisionId:sameRevision,properties:{title:'synthetic-slate-audited-properties'}},memberId);
 assert.equal(same.status,200);assert.equal(same.data.receipt.unchanged,true);assert.equal(same.data.receipt.activityId,null);unchanged.push(sameKey);
 const staleKey=key();const stale=await door.request('PATCH',`/api/pages/${id}`,{operationKey:staleKey,expectedRevisionId:initial,properties:{title:'synthetic-slate-refused'}},memberId);
 assert.equal(stale.status,409);assert.equal(await revision(id),sameRevision);refusals.push(staleKey);
 const space=await mutate('container creation','containers.create','POST','/api/containers',{name:'synthetic-slate-destination',visibility:'private'},r=>({kind:'container',id:r.value.id}));
 await mutate('container change','containers.update','PATCH',`/api/containers/${space.value.id}`,{expectedRevisionId:space.receipt.revisionId,name:'synthetic-slate-changed-space'},{kind:'container',id:space.value.id});
 const preview=await readMove(id,space.value.id);
 await mutate('page move','pages.move','POST',`/api/pages/${id}/move`,{expectedRevisionId:await revision(id),containerId:space.value.id,treePosition:'1',accessPreviewHash:preview.accessPreviewHash},pageTarget(id));
 // Return to the member's explicitly granted space before their following actions.
 const back=await readMove(id,containerId);
 await mutate('page move back','pages.move','POST',`/api/pages/${id}/move`,{expectedRevisionId:await revision(id),containerId,treePosition:'1',accessPreviewHash:back.accessPreviewHash},pageTarget(id));
 async function readMove(pageId,to){const r=await door.request('POST',`/api/pages/${pageId}/move-preview`,{containerId:to},ownerId);assert.equal(r.status,200);return r.data;}
 const workspace=await read('/api/workspace');
 await mutate('coverage policies','workspace.update','PUT','/api/workspace',{expectedRevisionId:workspace.revisionId,name:workspace.name,mark:workspace.mark,description:workspace.description,guestAccess:'allowed',publicLinkAccess:'allowed',anonymousAccess:'allowed',policies:{...workspace.policies,'page.lifecycle.v1':'draft-then-publish','page.version.v1':'labelled','page.status.v1':'open-vocabulary','automation.scope.v1':'source'}},{kind:'workspace',id:workspaceId});
 await mutate('page publication','pages.publish','POST',`/api/pages/${id}/publish`,{expectedRevisionId:await revision(id)},pageTarget(id),memberId);
 const exposure={host:door.host,slug:'synthetic-slate-'+key()};
 await mutate('page external access','publishing.publish','POST',`/api/publishing/${id}`,{...exposure,expectedRevisionId:await revision(id)},pageTarget(id),memberId);
 await mutate('page unpublish external access','publishing.revoke','POST',`/api/publishing/${id}`,{...exposure,revoke:true,expectedRevisionId:await revision(id)},pageTarget(id),memberId);
 const beforeWithdrawal=await read(`/api/pages/${id}`,memberId),historyBefore=await read(`/api/revisions/${id}`,memberId);
 await mutate('page unpublication','pages.unpublish','POST',`/api/pages/${id}/unpublish`,{expectedRevisionId:await revision(id)},pageTarget(id),memberId);
 const withdrawn=await read(`/api/pages/${id}`,memberId);assert.equal(withdrawn.page.lifecycle,'draft');assert.equal(withdrawn.publishedRevisionId,null);assert.deepEqual(withdrawn.blocks,beforeWithdrawal.blocks);assert.deepEqual(await read(`/api/revisions/${id}`,memberId),historyBefore);
 const sameUnpublishKey=key(),sameUnpublish=await door.request('POST',`/api/pages/${id}/unpublish`,{operationKey:sameUnpublishKey,expectedRevisionId:withdrawn.page.revisionId},memberId);assert.equal(sameUnpublish.status,200);assert.equal(sameUnpublish.data.receipt.unchanged,true);unchanged.push(sameUnpublishKey);
 await mutate('page republication','pages.publish','POST',`/api/pages/${id}/publish`,{expectedRevisionId:withdrawn.page.revisionId},pageTarget(id),memberId);
 const deniedUnpublishKey=key(),deniedUnpublish=await door.request('POST',`/api/pages/${space.value.homePageId}/unpublish`,{operationKey:deniedUnpublishKey,expectedRevisionId:await revision(space.value.homePageId)},memberId);assert.equal(deniedUnpublish.status,404);refusals.push(deniedUnpublishKey);
 const c=await read(`/api/containers/${containerId}`);
 await mutate('container external access','container.access-settings','POST','/api/sharing/container-settings',{id:containerId,expectedRevisionId:c.revisionId,guestAccess:'forbidden',publicLinkAccess:'forbidden',anonymousAccess:'forbidden',visibility:c.visibility},{kind:'container',id:containerId});
 const status=await door.request('POST','/api/status',{operationKey:key(),key:'synthetic-slate-status',label:'Audit checked',color:'#334455',requiresVerification:false},ownerId);assert.equal(status.status,200);
 await mutate('page status change','pages.status','POST',`/api/status/page/${id}`,{expectedRevisionId:await revision(id),statusKey:'synthetic-slate-status'},pageTarget(id),memberId);
 const verified=await door.request('POST','/api/status',{operationKey:key(),key:'synthetic-slate-verified',label:'Audit verified',color:'#335544',requiresVerification:true},ownerId);assert.equal(verified.status,200);
 const opened=await read(`/api/pages/${id}`,memberId);
 const visit=await door.request('POST',`/api/pages/${id}/open`,{operationKey:key(),revisionId:opened.workingRevisionId},memberId);assert.equal(visit.status,200);
 await mutate('page verification change','pages.status','POST',`/api/status/page/${id}`,{expectedRevisionId:await revision(id),statusKey:'synthetic-slate-verified',attestRevisionId:opened.workingRevisionId},pageTarget(id),memberId);
 assert.equal((await read(`/api/status/page/${id}`,memberId)).verification.state,'current');
 const personalGrant=await mutate('page grant','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:id,principalKind:'member',principalId:memberId,level:'full'},pageTarget(id));
 await mutate('page grant revoke','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:id,id:personalGrant.value.id,principalKind:'member',principalId:memberId,level:'full',revoke:true},pageTarget(id));
 const comment=await mutate('comment creation','comments.create','POST',`/api/comments/page/${id}`,{body:[{text:'synthetic-slate-member-comment'}]},r=>({kind:'comment-thread',id:r.value.threadId}),memberId);
 const edited=await mutate('comment editing','comments.edit','PATCH',`/api/comments/${comment.value.id}`,{expectedRevisionId:comment.value.revisionId,body:[{text:'synthetic-slate-edited-comment'}]},{kind:'comment-thread',id:comment.value.threadId},memberId);
 await mutate('comment resolution','comments.resolve','POST',`/api/comments/thread/${comment.value.threadId}/resolve`,{expectedRevisionId:edited.value.revisionId,resolved:true},{kind:'comment-thread',id:comment.value.threadId});
 await mutate('comment reaction','comments.reaction','POST',`/api/comments/page/${id}/reaction`,{commentId:comment.value.id,emoji:'thumbsup'},pageTarget(id),memberId);
 await mutate('comment deletion','comments.delete','PATCH',`/api/comments/${comment.value.id}`,{expectedRevisionId:edited.value.revisionId,delete:true},{kind:'comment-thread',id:comment.value.threadId},memberId);
 const group=await mutate('group creation','group.save','POST','/api/groups',{name:'synthetic-slate-group',memberIds:[memberId]},r=>({kind:'group',id:r.value.id}));
 const changedGroup=await mutate('group change','group.save','POST','/api/groups',{id:group.value.id,expectedRevisionId:group.value.revisionId,name:'synthetic-slate-group-changed',memberIds:[ownerId,memberId]},{kind:'group',id:group.value.id});
 await mutate('group deletion','group.delete','POST','/api/groups',{id:group.value.id,expectedRevisionId:changedGroup.value.revisionId,name:'synthetic-slate-group-changed',memberIds:[],remove:true},{kind:'group',id:group.value.id});
 const db=await mutate('database creation','databases.create','POST','/api/databases',{containerId,title:'synthetic-slate-audit-database'},r=>({kind:'database',id:r.value.id}),memberId);
 await mutate('database page publication','pages.publish','POST',`/api/pages/${db.value.pageId}/publish`,{expectedRevisionId:await revision(db.value.pageId,memberId)},pageTarget(db.value.pageId),memberId);
 const databaseTarget={kind:'database',id:db.value.id};let dbRevision=db.value.revisionId;
 const field={id:key(),name:'Audit value',type:'text',config:{},position:0};
 for(const [family,definition,remove] of [['database field creation',field,false],['database field change',{...field,name:'Changed value'},false],['database field deletion',{...field,name:'Changed value'},true]]){
  const r=await mutate(family,'databases.field','POST',`/api/databases/${db.value.id}/fields`,{expectedRevisionId:dbRevision,field:definition,delete:remove},databaseTarget,memberId);dbRevision=r.value.revisionId;
 }
 const view={id:key(),name:'Audit view',layout:'table',filters:[],sorts:[],groups:[],calculations:{},display:{},position:0};
 for(const [family,definition,remove] of [['database view creation',view,false],['database view change',{...view,name:'Changed view'},false],['database view deletion',{...view,name:'Changed view'},true]]){
  const r=await mutate(family,'databases.view','POST',`/api/databases/${db.value.id}/views`,{expectedRevisionId:dbRevision,view:definition,delete:remove},databaseTarget,memberId);dbRevision=r.value.revisionId;
 }
 for(const locked of [true,false]){const r=await mutate(`database structure ${locked?'lock':'unlock'}`,'databases.lock','POST',`/api/databases/${db.value.id}/lock`,{expectedRevisionId:dbRevision,locked},databaseTarget,memberId);dbRevision=r.value.revisionId;}
 const rule=await mutate('automation configuration','automation.configure','POST','/api/automation',{name:'synthetic-slate-audit-rule',scope:'source',sourceDatabaseId:db.value.id,trigger:{event:'record-created'},conditions:[],actions:[{type:'comment',body:'synthetic-slate-automated-comment'}]},r=>({kind:'automation-rule',id:r.value.id}),memberId);
 const record=await mutate('automation trigger','databases.record.create','POST',`/api/databases/${db.value.id}/records`,{title:'synthetic-slate-audit-trigger',values:{}},r=>pageTarget(r.value.pageId),memberId);
 await mutate('record page publication','pages.publish','POST',`/api/pages/${record.value.pageId}/publish`,{expectedRevisionId:await revision(record.value.pageId,memberId)},pageTarget(record.value.pageId),memberId);
 await door.runScheduled();await door.runScheduled();
 const runs=(await read(`/api/automation/${rule.value.id}/runs`,memberId)).items.filter(run=>run.state==='success');assert.equal(runs.length,1,'One native successful automation run after maintenance replay');
 const automation=[];
 for(const action of ['automation.queued','automation.success']){
  const rows=(await entries({action,actorId:memberId,kind:'automation-run'},memberId)).filter(row=>row.automationRunId===runs[0].id);
  assert.equal(rows.length,1,`${action}: one state transition per run`);assert.equal(rows[0].actor.id,memberId);assert.deepEqual(rows[0].target,{kind:'automation-run',id:runs[0].id});assert.ok(Number.isFinite(Date.parse(rows[0].occurredAt)));automation.push(rows[0]);
 }
 assert.equal((await read(`/api/comments/page/${record.value.pageId}`,memberId)).comments.length,1);
 await mutate('member invitation','member.invite','POST','/api/invitations',{kind:'member',email:['synthetic-slate-invited-'+key(),'test.invalid'].join('@')},{kind:'invitation',id:workspaceId});
 // A reviewed, committed incumbent fixture reaches native completion and remains a single staged action.
 const importKey=key(),bytes=await door.importFixture();
 const uploaded=await door.request('POST','/api/imports/stream',bytes,ownerId,{'X-Import-Metadata':encodeURIComponent(JSON.stringify({operationKey:importKey,format:'confluence-space',name:'confluence-space-export.zip',sizeBytes:bytes.length}))});assert.equal(uploaded.status,200,JSON.stringify(uploaded.data));
 const importId=uploaded.data.id;
 assert.equal((await door.request('POST',`/api/imports/${importId}/preview`,{mappings:[]},ownerId)).status,200);
 let job=await read(`/api/imports/${importId}`);assert.equal(job.state,'preview');
 const applied=await door.request('POST',`/api/imports/${importId}/apply`,{fingerprint:job.report.fingerprint},ownerId);assert.equal(applied.status,200,JSON.stringify(applied.data));
 for(let n=0;n<60&&job.state!=='completed';n++){const r=await door.request('POST',`/api/imports/${importId}/resume`,{},ownerId);assert.equal(r.status,200,JSON.stringify(r.data));job=r.data;}
 assert.equal(job.state,'completed');assert.ok(job.counts.pages>0);
 assert.equal((await door.request('POST',`/api/imports/${importId}/apply`,{fingerprint:job.report.fingerprint},ownerId)).status,200);
 const importRows=(await entries({action:'imports.stage',actorId:ownerId,kind:'import'})).filter(row=>row.operationKey===importKey);assert.equal(importRows.length,1);assert.deepEqual(importRows[0].target,{kind:'import',id:importId});
 // Downloads are opened, not merely admitted. Their supplied operation key also deduplicates retry.
 const exports=[];
 for(const [scope,target,actor] of [['page',id,memberId],['container',containerId,ownerId]]){
  const operationKey=key(),input={operationKey,scope,id:target,format:'html'};
  const response=await door.request('POST','/api/exports/readable',input,actor);assert.equal(response.status,200,JSON.stringify(response.data));
  const files=unzipSync(response.bytes),manifest=JSON.parse(new TextDecoder().decode(files['slate-readable.json']));assert.ok(manifest.pages.some(page=>page.id===id));assert.ok(new TextDecoder().decode(files[`pages/${id}.html`]).includes('synthetic-slate-audited-body'));
  const receipt=JSON.parse(response.headers['x-slate-receipt']);
  const entry={family:`readable ${scope} export`,action:'exports.readable',actorId:actor,target:{kind:scope,id:target},receipt};await assertRow(entry);
  const retry=await door.request('POST','/api/exports/readable',input,actor);assert.equal(retry.status,200);assert.deepEqual(JSON.parse(retry.headers['x-slate-receipt']),receipt);await assertRow(entry);receipts.push(entry);exports.push(entry);
 }
 const privatePage=await mutate('export revocation target','pages.create','POST','/api/pages',{containerId:space.value.id,title:'synthetic-slate-export-revocation'},r=>pageTarget(r.value.pageId));
 await mutate('export target publication','pages.publish','POST',`/api/pages/${privatePage.value.pageId}/publish`,{expectedRevisionId:await revision(privatePage.value.pageId)},pageTarget(privatePage.value.pageId));
 const exportGrant=await mutate('export reader grant','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:privatePage.value.pageId,principalKind:'member',principalId:memberId,level:'view'},pageTarget(privatePage.value.pageId));
 const capturedExport={operationKey:key(),scope:'page',id:privatePage.value.pageId,format:'html'},acceptedExport=await door.request('POST','/api/exports/readable',capturedExport,memberId);assert.equal(acceptedExport.status,200);assert.ok(Object.keys(unzipSync(acceptedExport.bytes)).length>0);
 const capturedReceipt=JSON.parse(acceptedExport.headers['x-slate-receipt']);
 const capturedRecord={family:'readable export before revocation',action:'exports.readable',actorId:memberId,target:pageTarget(privatePage.value.pageId),receipt:capturedReceipt};await assertRow(capturedRecord);receipts.push(capturedRecord);
 await mutate('revoke export reader','sharing.grant','POST','/api/sharing',{targetKind:'page',targetId:privatePage.value.pageId,id:exportGrant.value.id,principalKind:'member',principalId:memberId,level:'view',revoke:true},pageTarget(privatePage.value.pageId));
 for(const operationKey of [capturedExport.operationKey,key()]){const refused=await door.request('POST','/api/exports/readable',{...capturedExport,operationKey},memberId);assert.equal(refused.status,404,'Revocation denies new and captured readable exports before releasing bytes');if(operationKey!==capturedExport.operationKey)refusals.push(operationKey);}
 const retainedExport=(await entries({action:'exports.readable'})).filter(row=>row.operationKey===capturedExport.operationKey);assert.equal(retainedExport.length,1);assert.equal(retainedExport[0].id,capturedReceipt.activityId);
 assert.ok(!(await entries({action:'exports.readable'},memberId)).some(row=>row.id===capturedReceipt.activityId),'Revocation also hides the retained export entry from its former reader');
 // Remove the separate export target before proving deletion of its now-empty space.
 await mutate('revoked export target trash','archive.trash','POST',`/api/archive/${privatePage.value.pageId}`,{action:'trash',expectedRevisionId:await revision(privatePage.value.pageId)},pageTarget(privatePage.value.pageId));
 await mutate('revoked export target erasure','archive.permanent-delete','POST',`/api/archive/${privatePage.value.pageId}/permanent-delete`,{confirmedPageIds:[privatePage.value.pageId]},pageTarget(privatePage.value.pageId));
 const workspaceKey=key(),exported=await door.request('POST','/api/exports/workspace',{operationKey:workspaceKey},ownerId);assert.equal(exported.status,200,JSON.stringify(exported.data));assert.equal(exported.data.state,'completed');
 const zip=await door.request('GET',`/api/exports/${exported.data.id}/download`,undefined,ownerId);assert.equal(zip.status,200);assert.ok(Object.keys(unzipSync(zip.bytes)).length>0);
 assert.deepEqual((await door.request('POST','/api/exports/workspace',{operationKey:workspaceKey},ownerId)).data,exported.data);
 const workspaceRows=(await entries({action:'exports.workspace',actorId:ownerId,kind:'export'})).filter(row=>row.operationKey===workspaceKey);assert.equal(workspaceRows.length,1);assert.deepEqual(workspaceRows[0].target,{kind:'export',id:exported.data.id});
 const deniedKey=key(),denied=await door.request('POST','/api/exports/workspace',{operationKey:deniedKey},memberId);assert.equal(denied.status,403);refusals.push(deniedKey);
 // Restore and deletion have their own retained receipts; permanent erasure uses a separate page.
 await mutate('version restore','pages.restore','POST',`/api/revisions/${id}/${initial}/restore`,{expectedRevisionId:await revision(id)},pageTarget(id),memberId);
 await mutate('version deletion','versions.delete','DELETE',`/api/revisions/${id}/${initial}`,{},pageTarget(id));
 let lifecycleRevision=await revision(id);
 for(const action of ['archive','restore','trash','restore']){const r=await mutate('page '+action,'archive.'+action,'POST',`/api/archive/${id}`,{action,expectedRevisionId:lifecycleRevision},pageTarget(id),memberId);lifecycleRevision=r.value.revisionId;}
 const erased=await create('synthetic-slate-erase-only');
 await mutate('erase admission','archive.trash','POST',`/api/archive/${erased.value.pageId}`,{action:'trash',expectedRevisionId:await revision(erased.value.pageId)},pageTarget(erased.value.pageId));
 await mutate('permanent deletion','archive.permanent-delete','POST',`/api/archive/${erased.value.pageId}/permanent-delete`,{confirmedPageIds:[erased.value.pageId]},pageTarget(erased.value.pageId));
 // A populated space and a member cannot use the destructive owner door.
 const containerRevision=(await read(`/api/containers/${space.value.id}`)).revisionId;
 for(const [actor,expected] of [[ownerId,409],[memberId,403]]){
  const operationKey=key(),r=await door.request('DELETE',`/api/containers/${space.value.id}`,{operationKey,expectedRevisionId:containerRevision,confirmed:true},actor);assert.equal(r.status,expected);refusals.push(operationKey);
 }
 const home=space.value.homePageId;
 await mutate('empty space home trash','archive.trash','POST',`/api/archive/${home}`,{action:'trash',expectedRevisionId:await revision(home)},pageTarget(home));
 await mutate('empty space home erasure','archive.permanent-delete','POST',`/api/archive/${home}/permanent-delete`,{confirmedPageIds:[home]},pageTarget(home));
 const deletedContainer=await mutate('container deletion','containers.delete','DELETE',`/api/containers/${space.value.id}`,{expectedRevisionId:containerRevision,confirmed:true},{kind:'container',id:space.value.id});
 assert.ok(!(await read('/api/containers')).items.some(item=>item.id===space.value.id));
 const sameContainerKey=key(),sameContainer=await door.request('DELETE',`/api/containers/${space.value.id}`,{operationKey:sameContainerKey,expectedRevisionId:deletedContainer.receipt.revisionId,confirmed:true},ownerId);assert.equal(sameContainer.status,200);assert.equal(sameContainer.data.receipt.unchanged,true);unchanged.push(sameContainerKey);
 await mutate('member removal','member.remove','POST','/api/members/remove',{memberId:door.removableMemberId},{kind:'member',id:door.removableMemberId});
 assert.ok(!(await read('/api/members')).items.some(item=>item.id===door.removableMemberId));
 const all=await entries({});
 for(const operationKey of [...refusals,...unchanged])assert.ok(!all.some(row=>row.operationKey===operationKey),'Refused and unchanged operations create no activity');
 // The inventory is based on independently named operations above, never on the queried rows.
 for(const actorId of [ownerId,memberId])for(const action of new Set(receipts.filter(row=>row.actorId===actorId).map(row=>row.action))){const expected=receipts.filter(row=>row.action===action&&row.actorId===actorId);const found=(await entries({action},action==='exports.readable'?ownerId:actorId)).filter(row=>expected.some(item=>item.receipt.operationKey===row.operationKey));assert.deepEqual(found.map(row=>row.operationKey).sort(),expected.map(row=>row.receipt.operationKey).sort(),`${action}: exact operation inventory for its current reader`);}
 return {redactedPageIds:[erased.value.pageId,home,privatePage.value.pageId],receipts,automation,import:importRows[0],workspaceExport:workspaceRows[0],refusals,unchanged,pageId:id,memberContainerGrant:shared.value.id};
}
