import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {root} from '../../e2e/runtime-harness.mjs';
import {publicationChecks} from '../interface/publication.mjs';
import {call,ok,withSecondPerson} from './two-people-support.mjs';

/** Fold the existing publication assertions into the loaded native browser journey. */
export async function publicationJourney(state) {
  const width=state.page.viewportSize().width;
  const directory=path.join(root,'.artifacts/ui-convergence/publication',String(width));
  await mkdir(directory,{recursive:true});
  const id=(await state.api('/api/pages')).items.find(item=>item.title==='Welcome').id;
  const containerId=(await state.api(`/api/pages/${id}`)).page.containerId;
  await ok(state.context,state.origin,'POST','/api/sharing',{
    operationKey:crypto.randomUUID(),targetKind:'container',targetId:containerId,
    principalKind:'member',principalId:'browser-reader',level:'view',
  });
  await withSecondPerson(state,width,async people=>{
    const target=await publicationChecks({page:state.page,context:state.context,id,
      runtime:{origin:state.origin,directory},reader:people.bob,check:()=>{}});
    const workspace=await state.api('/api/workspace');
    const profile=async lifecycle=>{
      const {id,revisionId,...fields}=await state.api('/api/workspace');
      await ok(state.context,state.origin,'PUT','/api/workspace',{...fields,operationKey:crypto.randomUUID(),expectedRevisionId:revisionId,policies:{...fields.policies,'page.lifecycle.v1':lifecycle}});
    };
    await profile('draft-then-publish');
    try {
    const read=()=>state.api(`/api/pages/${target}`);
    const current=await read();
    await ok(state.context,state.origin,'POST',`/api/pages/${target}/publish`,{
      operationKey:crypto.randomUUID(),expectedRevisionId:current.page.revisionId,
      publishAt:new Date(Date.now()+3600000).toISOString(),
    });
    const scheduled=await read();
    await ok(state.context,state.origin,'PATCH',`/api/pages/${target}`,{
      operationKey:crypto.randomUUID(),expectedRevisionId:scheduled.page.revisionId,
      properties:{title:'Schedule changed after review'},
    });
    // Advance only this saved schedule's clock input; the emitted cron handler
    // still rechecks the real current revision and performs the failure itself.
    await state.fixtureSql([`UPDATE content_schedules SET publish_at='2000-01-01T00:00:00.000Z' WHERE page_id='${target}'`]);
    await state.runScheduled();
    const failed=await read();
    assert.equal(failed.page.lifecycle,'scheduled');
    assert.equal(failed.schedule.state,'failed');
    assert.equal((await call(people.bob.context,state.origin,'GET',`/api/pages/${target}`)).status,404);
    await state.page.goto(`${state.origin}/app/pages/${target}`,{waitUntil:'networkidle'});
    await expect(state.page.getByRole('alert')).toContainText(failed.schedule.failure);
    await state.page.screenshot({path:path.join(directory,'failed-publication.png'),fullPage:true});
    await profile('always-live');
    await state.page.reload({waitUntil:'networkidle'});
    await expect(state.page.getByRole('alert').filter({hasText:'Scheduled publication needs attention'})).toHaveCount(0);
    await state.page.getByRole('button',{name:'More',exact:true}).click();
    await expect(state.page.getByRole('menuitem',{name:'Cancel scheduled publication',exact:true})).toHaveCount(0);
    await state.page.keyboard.press('Escape');
    const hidden=await read();
    assert.deepEqual(hidden.schedule,failed.schedule);
    assert.equal(hidden.page.revisionId,failed.page.revisionId);
    await profile('draft-then-publish');
    await state.page.reload({waitUntil:'networkidle'});
    await expect(state.page.getByRole('alert')).toContainText(failed.schedule.failure);
    } finally {await profile(workspace.policies['page.lifecycle.v1']);}
  });
}
