import {test,expect} from 'vitest';
import {env} from 'cloudflare:test';
import {scenario,profile,key} from '../policies/helpers';
import {createPage,readPage} from '../../../src/core/features/pages/service';
import {listPages} from '../../../src/core/features/pages/tree';
import {cancelSchedule} from '../../../src/core/features/lifecycle/service';
import {publishPage} from './review-helper';
import {navigation,openRecent,setFavourite} from '../../../src/core/features/navigation/service';
import {saveGrant} from '../../../src/core/features/sharing/grants';
import {runContentJobs} from '../../../src/core/features/lifecycle/jobs';

test('LIFE-004 author projections distinguish scheduled, failed and cancelled time without exposing timing to other readers',async()=>{
 const {owner,reader,outsider,containerId}=await scenario();await profile(owner,{'page.lifecycle.v1':'draft-then-publish'});
 const p=await createPage(owner,{operationKey:key('timed'),containerId,title:'Scheduled projection'}),due=new Date(Date.parse(owner.now)+60000).toISOString();
 await saveGrant(owner,{operationKey:key('timed-viewer'),targetKind:'page',targetId:p.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'view'});
 for(const ctx of [owner,reader]) {await openRecent(ctx,{operationKey:key('recent'),pageId:p.value.pageId});await setFavourite(ctx,{operationKey:key('favourite'),kind:'page',id:p.value.pageId,enabled:true});}
 const scheduled=await publishPage(owner,p.value.pageId,{operationKey:key('timed-schedule'),expectedRevisionId:p.receipt.revisionId,publishAt:due});
 const projections=async()=>{const nav=await navigation(owner);return [(await readPage(owner,p.value.pageId)).page,(await listPages(owner)).items.find(p=>p.id===scheduled.value.pageId),nav.recents.find(p=>p.id===scheduled.value.pageId),nav.favourites.find(p=>p.id===scheduled.value.pageId)];};
 for(const projection of await projections())expect(projection).toMatchObject({publishAt:due,scheduleState:'scheduled',scheduleFailure:null});
 expect((await readPage(reader,p.value.pageId)).page).not.toHaveProperty('publishAt');
 expect((await listPages(reader)).items.find(x=>x.id===p.value.pageId)).not.toHaveProperty('publishAt');
 const viewerNav=await navigation(reader);expect(viewerNav.recents.find(x=>x.id===p.value.pageId)).not.toHaveProperty('publishAt');expect(viewerNav.favourites.find(x=>x.id===p.value.pageId)).not.toHaveProperty('publishAt');
 expect((await listPages(outsider)).items.some(x=>x.id===p.value.pageId)).toBe(false);
 await env.DB.exec("CREATE TRIGGER qualification_projection_failure BEFORE INSERT ON content_events WHEN NEW.kind='published' BEGIN SELECT RAISE(ABORT,'Planned publication failed'); END;");
 try {await runContentJobs(env,due);}finally{await env.DB.exec('DROP TRIGGER qualification_projection_failure;');}
 for(const projection of await projections()){expect(projection).toMatchObject({publishAt:due,scheduleState:'failed'});expect(projection!.scheduleFailure).toContain('Planned publication failed');}
 await cancelSchedule(owner,p.value.pageId,{operationKey:key('cancel-timed'),expectedRevisionId:scheduled.receipt.revisionId});
 for(const projection of await projections()){expect(projection).not.toHaveProperty('publishAt');expect(projection).not.toHaveProperty('scheduleFailure');}
});
