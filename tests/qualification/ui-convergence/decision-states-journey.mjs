import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {expect} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {root} from '../../e2e/runtime-harness.mjs';
import {openPageAction} from './browser-support.mjs';
import {call, ok, withSecondPerson} from './two-people-support.mjs';

/** Native human decisions: both replacement doors, terminal refusals and audit readback. */
export async function decisionStatesJourney(state) {
  const width = state.page.viewportSize().width, entryUrl = state.page.url();
  await withSecondPerson(state, width, async people => {
    const {alice, bob, record, shot} = people, {origin} = state;
    const read = path => ok(alice.context, origin, 'GET', path);
    const mutate = (path, data) => ok(alice.context, origin, 'POST', path, {operationKey: randomUUID(), ...data});
    const containerId = (await mutate('/api/containers', {name: 'Decision state desk', visibility: 'private'})).value.id;
    await mutate('/api/sharing', {targetKind:'container', targetId:containerId, principalKind:'member', principalId:bob.id, level:'edit'});
    const createPage = async title => (await mutate('/api/pages', {containerId, title})).value.pageId;
    const evidenceId = await createPage('Decision evidence');
    const pageId = await createPage('Decision state proposal');
    assert.equal((await ok(bob.context, origin, 'GET', `/api/pages/${pageId}`)).permissions.level, 'edit');
    const committed = [], replays = [];
    async function uiWrite(actor, path, click) {
      // Read the real Worker response before navigation can discard its body.
      let resolve, reject;
      const observed = new Promise((yes, no) => {resolve=yes;reject=no;});
      const matches = url => url.pathname === path;
      const handler = async route => {
        if(route.request().method()!=='POST')return route.continue();
        try {
          const input=route.request().postDataJSON(), response=await route.fetch({maxRetries:0});
          const result=await response.json();
          await route.fulfill({response});
          resolve({input,result,status:response.status()});
        } catch(cause){reject(cause);await route.abort().catch(()=>{});}
      };
      await actor.page.route(matches,handler);
      try {
        await click();
        const {result,input,status}=await observed;
        assert.equal(status,200,JSON.stringify(result));
        assert.equal(result.receipt.operationKey,input.operationKey);
        assert.equal(result.receipt.entity.kind,'decision');
        assert.equal(result.receipt.entity.id,result.value.id);
        assert.equal(result.receipt.revisionId,result.value.revisionId);
        console.log('Native decision commit',path,result.value.state??'review',result.receipt.revisionId);
        committed.push({result,path,input,actorId:actor===alice?'browser-owner':bob.id});
        replays.push({actor,path,input,result});
        assert.deepEqual(await ok(actor.context,origin,'POST',path,input),result);
        return result;
      } finally {await actor.page.unroute(matches,handler);}
    }
    async function propose(actor, target, question) {
      await actor.page.goto(`${origin}/app/pages/${target}`, {waitUntil:'networkidle'});
      await openPageAction(actor.page, 'Add decision record');
      const dialog = actor.page.getByRole('dialog', {name:'Add a decision to this page', exact:true});
      await dialog.getByLabel('Question', {exact:true}).fill(question);
      await dialog.getByLabel('Options considered').fill('Wait\nProceed');
      await dialog.getByLabel('Decision owner').selectOption('browser-owner');
      await dialog.getByLabel('Proposed outcome', {exact:true}).fill('Wait');
      await dialog.getByLabel('Rationale', {exact:true}).fill('Current evidence supports waiting.');
      await dialog.getByLabel('Add a page as evidence').selectOption(evidenceId);
      await dialog.getByRole('button', {name:'Add current revision', exact:true}).click();
      await expect(dialog).toContainText('1 exact reference retained.');
      const result = await uiWrite(actor, '/api/decisions', () => dialog.getByRole('button', {name:'Create proposed decision', exact:true}).click());
      await actor.page.waitForURL(`**/app/decisions/${result.value.id}`);
      await expect(actor.page.locator('.finding .eyebrow')).toHaveText('proposed');
      return result;
    }
    const first = await propose(bob, pageId, 'Should the team proceed?');
    const firstId = first.value.id;
    const snapshot = async () => {
      const ids = (await read('/api/decisions')).items.filter(item => item.content?.citations?.some(ref=>ref.sourceId===evidenceId)).map(item=>item.id).sort();
      return {decisions:await Promise.all(ids.map(id=>read(`/api/decisions/${id}`))), histories:await Promise.all(ids.map(id=>read(`/api/decisions/${id}/history`))), reviews:await Promise.all(ids.map(id=>read(`/api/decisions/${id}/reviews`))), activity:await read('/api/activity?kind=decision&limit=100'), pages:await read(`/api/pages?containerId=${containerId}`)};
    };
    await shot('bob','non-owner proposed decision');
    const beforeDenied = await snapshot();
    const denied = bob.page.waitForResponse(response => new URL(response.url()).pathname === `/api/decisions/${firstId}/accept` && response.request().method()==='POST');
    await bob.page.getByRole('button', {name:'Accept decision', exact:true}).click();
    const refusal = await denied;
    assert.equal(refusal.status(),403);
    assert.equal((await refusal.json()).code,'DECISION_OWNER_REQUIRED');
    await expect(bob.page.getByRole('alert')).toContainText('This content isn’t available.');
    assert.deepEqual(await snapshot(),beforeDenied,'A non-owner acceptance changes no decisions, histories, reviews, activity or pages.');
    const accept = async id => {
      const result = await uiWrite(alice, `/api/decisions/${id}/accept`, () => alice.page.getByRole('button',{name:'Accept decision',exact:true}).click());
      await expect(alice.page.locator('.finding .eyebrow')).toHaveText('accepted');
      return result;
    };
    await alice.page.goto(`${origin}/app/decisions/${firstId}`,{waitUntil:'networkidle'});
    await accept(firstId);
    await shot('alice','appointed-owner accepted decision');
    await alice.page.getByText('Record a review',{exact:true}).click();
    await alice.page.getByLabel('What did you conclude?',{exact:true}).fill('The current outcome still applies.');
    await uiWrite(alice, `/api/decisions/${firstId}/review`, () => alice.page.getByRole('button',{name:'Record review',exact:true}).click());
    await expect(alice.page.locator('.finding .eyebrow')).toHaveText('accepted');
    const successor = await uiWrite(alice, `/api/decisions/${firstId}/propose-successor`, () => alice.page.getByRole('button',{name:'Prepare a replacement decision',exact:true}).click());
    const secondId = successor.value.id;
    await alice.page.waitForURL(`**/app/decisions/${secondId}`);
    await expect(alice.page.locator('.finding .eyebrow')).toHaveText('proposed');
    assert.equal((await read(`/api/decisions/${firstId}`)).state,'accepted','Preparation alone leaves the earlier decision accepted.');
    await alice.page.getByLabel('Decision',{exact:true}).fill('Proceed with a staged launch');
    await alice.page.getByLabel('Why this choice?').fill('The replacement has current evidence.');
    await uiWrite(alice,'/api/decisions',()=>alice.page.getByRole('button',{name:'Save proposed decision',exact:true}).click());
    await expect(alice.page.getByRole('button',{name:'Accept decision',exact:true})).toBeVisible();
    await accept(secondId);
    assert.equal((await read(`/api/decisions/${firstId}`)).state,'superseded');
    const third = await propose(bob, await createPage('Decision selected replacement'), 'Which launch follows the staged launch?');
    const thirdId = third.value.id;
    await alice.page.goto(`${origin}/app/decisions/${thirdId}`,{waitUntil:'networkidle'});
    await alice.page.getByLabel('Replaces an earlier decision').selectOption(secondId);
    await accept(thirdId);
    for(const [earlier,replacement] of [[firstId,secondId],[secondId,thirdId]]) {
      const row=await read(`/api/decisions/${earlier}`);
      assert.equal(row.state,'superseded');assert.equal(row.superseded_by_decision_id,replacement);
      assert.equal((await read(`/api/decisions/${replacement}`)).content.supersedesId,earlier);
      await alice.page.goto(`${origin}/app/decisions/${earlier}`,{waitUntil:'networkidle'});
      await alice.page.reload({waitUntil:'networkidle'});
      await expect(alice.page.locator('.finding .eyebrow')).toHaveText('superseded');
      await expect(alice.page.getByRole('button',{name:/^(Accept decision|Save proposed decision|Record review|Prepare a replacement decision)$/})).toHaveCount(0);
      await expect(alice.page.getByRole('link',{name:/^Read the replacement decision:/})).toBeVisible();
      await shot('alice',`superseded ${earlier===firstId?'prepared':'selected'} replacement`);
    }
    // A fresh proposal tries to reuse a terminal predecessor; every other terminal verb is also attempted.
    const probe = await propose(bob,await createPage('Terminal refusal probe'),'Can a terminal decision be reopened?');
    const beforeTerminal=await snapshot(), terminal=await read(`/api/decisions/${firstId}`);
    const save={...committed[0].input,id:firstId,expectedRevisionId:terminal.revision_id,operationKey:randomUUID(),outcome:'Rewritten'};
    const refusals=[];
    for(const [path,data,code] of [
      [`/api/decisions/${firstId}/accept`,{operationKey:randomUUID(),expectedRevisionId:terminal.revision_id},'IMMUTABLE_DECISION'],
      ['/api/decisions',save,'IMMUTABLE_DECISION'],
      [`/api/decisions/${firstId}/review`,{operationKey:randomUUID(),expectedRevisionId:terminal.revision_id,note:'Reopen',nextReviewAt:null},'IMMUTABLE_DECISION'],
      [`/api/decisions/${firstId}/propose-successor`,{operationKey:randomUUID()},'DECISION_OWNER_REQUIRED'],
      [`/api/decisions/${probe.value.id}/accept`,{operationKey:randomUUID(),expectedRevisionId:probe.value.revisionId,supersedesId:firstId},'SUPERSESSION_AUTHORITY'],
    ]) {
      const refused=await call(alice.context,origin,'POST',path,data);
      assert.ok([403,409].includes(refused.status),JSON.stringify(refused));assert.equal(refused.body.code,code);
      assert.deepEqual(await snapshot(),beforeTerminal,`${path} leaves all canonical records and audit unchanged.`);
      refusals.push({path,...refused});
    }
    // Replaying successful writes after later transitions never adds a second revision or activity row.
    for(const replay of replays)assert.deepEqual(await ok(replay.actor.context,origin,'POST',replay.path,replay.input),replay.result);
    assert.deepEqual(await snapshot(),beforeTerminal);
    const audit=(await read('/api/activity?kind=decision&limit=100')).items;
    const expected=[];
    for(const {result,path,actorId,input} of committed) {
      const id=result.value.id, receipt=result.receipt;
      const history=(await read(`/api/decisions/${id}/history`)).items;
      const revision=history.find(row=>row.id===receipt.revisionId);
      const kind=path.endsWith('/accept')?'decision-acceptance':path.endsWith('/review')?'decision-review':'decision';
      assert.equal(revision.entity_kind,kind);assert.equal(revision.actor_id,actorId);assert.equal(revision.created_at,receipt.committedAt);
      const action=path.endsWith('/accept')?'decisions.accept':path.endsWith('/review')?'decisions.review':path.endsWith('/propose-successor')?'decisions.propose-successor':'decisions.save';
      const event=audit.find(row=>row.id===receipt.activityId);
      assert.ok(event);assert.equal(event.action,action);assert.equal(event.operationKey,input.operationKey);
      expected.push({id:receipt.activityId,revisionId:receipt.revisionId,targetId:id,actorId,at:receipt.committedAt});
      if(path.endsWith('/accept')) {
        const predecessor=(await read(`/api/decisions/${id}`)).content.supersedesId;
        if(predecessor){const supersession=(await read(`/api/decisions/${predecessor}/history`)).items.filter(row=>row.entity_kind==='decision-supersession');assert.equal(supersession.length,1);assert.equal(supersession[0].actor_id,actorId);assert.equal(supersession[0].created_at,receipt.committedAt);const entries=audit.filter(row=>row.target.id===predecessor&&row.action==='decisions.supersede');assert.equal(entries.length,1);expected.push({id:entries[0].id,revisionId:supersession[0].id,targetId:predecessor,actorId,at:receipt.committedAt});}
      }
    }
    const ids=new Set(expected.map(item=>item.targetId)), actual=audit.filter(item=>ids.has(item.target.id));
    assert.equal(actual.length,expected.length,'Exactly one activity entry per committed decision operation or supersession, under replay.');
    for(const item of expected){const entry=actual.find(row=>row.id===item.id);assert.ok(entry);assert.equal(entry.actor.id,item.actorId);assert.equal(entry.occurredAt,item.at);assert.equal(entry.target.id,item.targetId);}
    for(const id of ids){
      const retained=(await read(`/api/decisions/${id}/history`)).items;
      assert.deepEqual(retained.map(row=>row.id).sort(),expected.filter(row=>row.targetId===id).map(row=>row.revisionId).sort(),'Every retained revision corresponds to exactly one committed decision transition.');
      await alice.page.goto(`${origin}/app/decisions/${id}`,{waitUntil:'networkidle'});
      await alice.page.reload({waitUntil:'networkidle'});
      await alice.page.getByText('Decision history and reviews',{exact:true}).click();
      const history=(await read(`/api/decisions/${id}/history`)).items;
      for(const row of history){const link=alice.page.getByText('Decision history and reviews',{exact:true}).locator('..').locator(`a[href="/app/decisions/${id}?revision=${row.id}"]`);await expect(link).toContainText(row.entity_kind);await expect(link.locator('..')).toContainText(row.actor_id==='browser-owner'?alice.name:bob.name);await expect(link).toContainText(new Date(row.created_at).toLocaleString('en-US'));}
    }
    await shot('alice','decision history actor and time after reload');
    await alice.page.goto(origin+'/app/settings/activity',{waitUntil:'networkidle'});
    await alice.page.reload({waitUntil:'networkidle'});
    await alice.page.getByLabel('Kind').selectOption('decision');
    const filtered=alice.page.waitForResponse(response=>new URL(response.url()).pathname==='/api/activity'&&new URL(response.url()).searchParams.get('kind')==='decision');
    await alice.page.getByRole('button',{name:'Filter activity',exact:true}).click();await filtered;
    await expect(alice.page.locator('[data-activity-id]')).toHaveCount(actual.length);
    for(const entry of actual){const row=alice.page.locator(`[data-activity-id="${entry.id}"]`);await expect(row).toContainText(entry.actor.displayName);await expect(row).toContainText(entry.action.replace(/[._-]/g,' '));await expect(row.locator('time')).toHaveAttribute('datetime',entry.occurredAt);}
    await shot('alice','native decision activity actor and time');
    const receipts={width,artifact:JSON.parse(await readFile(path.join(root,'.cache/slate/build-source.json'),'utf8')),committed:committed.map(({result,path,input,actorId})=>({result,path,input,actorId})),expected,activity:actual,refusals,unchanged:beforeTerminal};
    record('DEC-002',receipts);
    const evidence=path.join(root,'.artifacts/ui-convergence/decisions',String(width));
    await mkdir(evidence,{recursive:true});
    await writeFile(path.join(evidence,'receipts.json'),JSON.stringify(receipts,null,2));
    console.log(`PROBE DEC-002 1-3: non-owner proposal and acceptance refusal; appointed-owner acceptance; both supersession doors; five terminal refusals; ${expected.length} exact history and activity rows after replay and reload at ${width}px`);
  });
  await state.page.goto(entryUrl,{waitUntil:'networkidle'});
}
