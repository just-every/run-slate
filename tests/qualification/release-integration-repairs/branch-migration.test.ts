import {test,expect} from 'vitest';
import {env,applyD1Migrations} from 'cloudflare:test';
import {fixture} from '../../flagship/release-clauses/inquiry/support';
import {createInquiry,recordFinding,inquiryView} from '../../../src/core/features/inquiries/service';

test('Forward branch admission migration preserves native prior inquiry findings and leaves unknown history unknown',async()=>{
  const prior=(env as unknown as {PRIOR_DB:D1Database}).PRIOR_DB;
  const migrations=env.TEST_MIGRATIONS;
  const original=migrations.filter(m=>m.name!=='0017_inquiry_branch_admission.sql');
  expect(original.length).toBe(migrations.length-1);
  await applyD1Migrations(prior,original);
  const f=await fixture();
  // Seed the prior native schema with real setup records; the inquiry itself is created by production services.
  const copies=[];
  for(const table of ['workspaces','members','containers','container_owners','container_members','container_grants','pages','page_grants','page_revisions','content_published_revisions']){
    const rows=(await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
    for(const row of rows){const columns=Object.keys(row);copies.push(prior.prepare(`INSERT ${table==='content_published_revisions'?'OR IGNORE ':''}INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).bind(...Object.values(row)));}
  }
  // Native page insert triggers already retain the published pair; replay it idempotently.
  await prior.batch([prior.prepare('PRAGMA defer_foreign_keys=ON'),...copies]);
  const ctx={...f.context(),db:prior};
  const made=await createInquiry(ctx,{operationKey:'prior-native-inquiry',pageId:f.page.pageId,question:'Which source explains the difference?',refs:f.refs,audience:[f.owner],hypotheses:[{statement:'A field changed',disconfirmation:'Original fields match'},{statement:'The handoff changed',disconfirmation:'Original handoff matches'}]});
  const hypotheses=(await prior.prepare('SELECT * FROM intelligence_hypotheses WHERE inquiry_id=? ORDER BY id').bind(made.value.id).all()).results;
  await recordFinding(ctx,{id:made.value.id,operationKey:'prior-native-finding',hypothesisId:String(hypotheses[0]!.id),status:'disconfirmed',finding:'The original field matches.',kind:'observation',refs:f.refs});
  const before=(await prior.prepare('SELECT * FROM intelligence_hypotheses WHERE inquiry_id=? ORDER BY id').bind(made.value.id).all()).results;
  const findings=(await prior.prepare('SELECT * FROM intelligence_artifacts WHERE inquiry_id=?').bind(made.value.id).all()).results;
  const migrationHistory=(await prior.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results;
  await applyD1Migrations(prior,migrations);
  const after=(await prior.prepare('SELECT * FROM intelligence_hypotheses WHERE inquiry_id=? ORDER BY id').bind(made.value.id).all()).results;
  expect(after).toEqual(before.map(row=>({...row,state:null,reason:null,parent_run_id:null,attempted_at:null})));
  expect((await prior.prepare('SELECT * FROM intelligence_artifacts WHERE inquiry_id=?').bind(made.value.id).all()).results).toEqual(findings);
  expect((await prior.prepare('SELECT * FROM d1_migrations ORDER BY id').all()).results.slice(0,-1)).toEqual(migrationHistory);
  const view=await inquiryView({...ctx},made.value.id);
  expect(view.hypotheses.find(h=>h.id===hypotheses[0]!.id)).toMatchObject({status:'disconfirmed',run_id:null,state:null,reason:null});
  expect(view.artifacts).toEqual(findings);
  expect((await prior.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
});
