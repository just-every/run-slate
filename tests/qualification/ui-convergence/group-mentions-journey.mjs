import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import seed from '../../../seed.json' with {type:'json'};
import {ok} from './two-people-support.mjs';
import {openPageAction,closeDetails} from './browser-support.mjs';

export async function groupMentionJourney(state,people) {
 const {alice,bob}=people,origin=state.origin;
 const now=new Date().toISOString();
 const extra=Array.from({length:seed.limits.groupMentionSize},(_,index)=>({id:`mention-reader-${index}`,name:['Casey Chen','Riley Brooks','Sam Patel'][index]??`Colleague ${index+1}`}));
 await state.atRest(extra.map(member=>`INSERT INTO members(id,workspace_id,email,display_name,initials,role,member_kind,status,created_at,updated_at) VALUES('${member.id}','browser-workspace','colleague-${member.id}@example.test','${member.name}','MC','member','member','active','${now}','${now}');`).join('\n'));
 const space=(await ok(alice.context,origin,'POST','/api/containers',{operationKey:randomUUID(),name:'Launch planning',visibility:'closed'})).value.id;
 const pageId=(await ok(alice.context,origin,'POST','/api/pages',{operationKey:randomUUID(),containerId:space,title:'Launch readiness',blocks:[{id:randomUUID(),blockType:'paragraph',treePosition:'a',content:{text:[{text:'Please review the final launch checklist.'}]}}]})).value.pageId;
 for(const id of [bob.id,extra[0].id,extra[1].id])await ok(alice.context,origin,'POST','/api/sharing',{operationKey:randomUUID(),targetKind:'page',targetId:pageId,principalKind:'member',principalId:id,level:id===bob.id?'edit':'view'});
 await ok(alice.context,origin,'POST','/api/groups',{operationKey:randomUUID(),name:'Launch team',memberIds:[bob.id,...extra.slice(0,3).map(m=>m.id)]});
 await ok(alice.context,origin,'POST','/api/groups',{operationKey:randomUUID(),name:'All colleagues',memberIds:[bob.id,...extra.map(m=>m.id)]});

 await alice.page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 await openPageAction(alice.page,'Comments');
 const text=alice.page.getByRole('textbox',{name:'Comment text',exact:true});
 await text.click();await alice.page.keyboard.press('@');
 let picker=alice.page.getByRole('dialog',{name:'Insert mention',exact:true});
 await picker.getByLabel('Find a person, group or page').fill('Launch');
 await picker.getByRole('button',{name:'Launch team · Group · 4 people',exact:true}).click();
 await expect(picker).toContainText('3 people will be notified');
 await expect(picker).toContainText('1 person cannot read this page');
 assert.equal((await ok(alice.context,origin,'GET',`/api/comments/page/${pageId}`)).comments.length,0,'Preview precedes saving.');
 await expect(picker.getByRole('button',{name:'Cancel mention',exact:true})).toBeInViewport({ratio:1});
 await people.shot('alice','group mention preview');
 await picker.getByRole('button',{name:'Mention readers',exact:true}).click();
 await expect(alice.page.locator('.comment-form')).toContainText('3 people will be notified');
 await alice.page.getByRole('button',{name:'Send comment',exact:true}).click();
 await expect(alice.page.locator('.comment-thread')).toContainText('@Launch team');
 await people.shot('alice','group comment sent');
 await bob.page.goto(`${origin}/app/inbox`,{waitUntil:'networkidle'});
 assert.equal((await ok(bob.context,origin,'GET','/api/notifications')).items.filter(item=>item.event==='mention'&&item.pageId===pageId).length,1);
 await expect(bob.page.locator('.outcome-list li').filter({hasText:'Launch readiness'}).filter({has:bob.page.locator('.outcome-kind').filter({hasText:/^mention\b/})})).toHaveCount(1);
 await people.shot('bob','group mention inbox');

 // A group mention in an autosaving edit is confirmed before insertion, too.
 await closeDetails(alice.page);
 const paragraph=alice.page.getByRole('textbox',{name:'Paragraph',exact:true}).first();
 await paragraph.click();await alice.page.keyboard.press('End');await alice.page.keyboard.press('@');
 picker=alice.page.getByRole('dialog',{name:'Insert mention',exact:true});
 await picker.getByLabel('Find a person, group or page').fill('Launch');
 await picker.getByRole('button',{name:'Launch team · Group · 4 people',exact:true}).click();
 await expect(picker).toContainText('3 people will be notified');
 await people.shot('alice','group edit preview');
 await picker.getByRole('button',{name:'Mention readers',exact:true}).click();
 await expect(paragraph).toContainText('@Launch team');
 await expect.poll(async()=>JSON.stringify((await ok(alice.context,origin,'GET',`/api/pages/${pageId}`)).blocks)).toContain('"kind":"group"');
 await people.shot('alice','group edit saved');

 await bob.page.goto(`${origin}/app/pages/${pageId}`,{waitUntil:'networkidle'});
 await openPageAction(bob.page,'Comments');
 await bob.page.getByRole('textbox',{name:'Comment text',exact:true}).click();await bob.page.keyboard.press('@');
 const refused=bob.page.getByRole('dialog',{name:'Insert mention',exact:true});
 await refused.getByLabel('Find a person, group or page').fill('All colleagues');
 await refused.getByRole('button',{name:`All colleagues · Group · ${seed.limits.groupMentionSize+1} people`,exact:true}).click();
 await expect(refused.getByRole('alert')).toContainText('Only space administrators');
 await expect(refused.getByRole('button',{name:'Mention readers',exact:true})).toHaveCount(0);
 await people.shot('bob','large group refused');
 await refused.getByRole('button',{name:'Cancel mention',exact:true}).click();

 await alice.page.goto(`${origin}/app/settings?section=workspace`,{waitUntil:'networkidle'});
 const setting=alice.page.getByRole('checkbox',{name:/Only space administrators may mention groups/});
 await expect(setting).toBeChecked();await setting.scrollIntoViewIfNeeded();
 await people.shot('alice','group mention settings');
 assert.equal(await alice.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0);
}
