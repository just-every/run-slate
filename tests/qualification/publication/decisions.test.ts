import {env} from 'cloudflare:test';
import {test,expect} from 'vitest';
import {scenario,key,rows} from '../policies/helpers';
import {createPage} from '../../../src/core/features/pages/service';
import {saveGrant} from '../../../src/core/features/sharing/grants';
import {saveDecision,removeDecision,getDecision} from '../../../src/core/features/decisions/service';
import {registerIntelligenceVisibility} from '../../../src/core/features/ai/integration';
import {notificationStatements} from '../../../src/core/features/notifications/events';
import {processNotificationOutbox} from '../../../src/core/features/notifications/outbox';
import {notificationList,today} from '../../../src/core/features/notifications/service';
import {readableTarget} from '../../../src/core/features/search/visibility';
import {knowledgeDecisions} from '../../../src/core/platform/db/knowledge-operations-schema';
import {getTableConfig} from 'drizzle-orm/sqlite-core';

test('DEC-001 removed decision history remains readable while creation, queued delivery, inbox, Today and search suppress it',async()=>{
 registerIntelligenceVisibility();
 const {owner,reader,containerId}=await scenario();
 const page=await createPage(owner,{operationKey:key('decision-page'),containerId,title:'Decision source'});
 await saveGrant(owner,{operationKey:key('decision-reader'),targetKind:'page',targetId:page.value.pageId,principalKind:'member',principalId:reader.actor.id,level:'view'});
 const input={operationKey:key('decision'),pageId:page.value.pageId,question:'Which option?',options:['A','B'],outcome:'A',rationale:'Evidence',ownerId:reader.actor.id,decidedAt:null,reviewAt:null,citations:[]};
 const active=await saveDecision(owner,input);
 expect((await notificationList(reader)).items.some(i=>(i.detail as any).decisionId===active.value.id)).toBe(true);
 expect((await today(reader)).decisions.some(i=>(i.detail as any).decisionId===active.value.id)).toBe(true);
 expect(await readableTarget(reader,'decision',active.value.id)).toBe(true);
 // Queue a second fact without running the dispatcher, then remove its target.
 await env.DB.batch(notificationStatements(owner,{id:key('queued-fact'),event:'decision-required',pageId:page.value.pageId,recipientIds:[reader.actor.id],detail:{decisionId:active.value.id}}));
 const epoch=await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>();
 await removeDecision(owner,{id:active.value.id,operationKey:key('remove'),expectedRevisionId:active.value.revisionId});
 expect((await env.DB.prepare('SELECT epoch FROM core_acl_epoch WHERE id=1').first<{epoch:number}>())!.epoch).toBeGreaterThan(epoch!.epoch);
 await processNotificationOutbox(owner);
 expect((await getDecision(owner,active.value.id)).removed_at).toBe(owner.now);
 expect(await readableTarget(reader,'decision',active.value.id)).toBe(false);
 expect((await notificationList(reader)).items.filter(i=>(i.detail as any).decisionId===active.value.id)).toEqual([]);
 expect((await today(reader)).decisions.filter(i=>(i.detail as any).decisionId===active.value.id)).toEqual([]);
 expect(await rows("SELECT id FROM notifications WHERE outbox_id LIKE 'qualification-queued-fact-%'")).toEqual([]);
 const late=key('late-fact');
 await env.DB.batch(notificationStatements(owner,{id:late,event:'decision-required',pageId:page.value.pageId,recipientIds:[reader.actor.id],detail:{decisionId:active.value.id}}));
 expect(await rows('SELECT recipients_json FROM notification_outbox WHERE id=?',late)).toEqual([{recipients_json:'[]'}]);
 const replacement=await saveDecision(owner,{...input,operationKey:key('replacement')});
 expect((await notificationList(reader)).items.some(i=>(i.detail as any).decisionId===replacement.value.id)).toBe(true);
 expect((await today(reader)).decisions.some(i=>(i.detail as any).decisionId===replacement.value.id)).toBe(true);
 expect(await readableTarget(reader,'decision',replacement.value.id)).toBe(true);
});

test('DEC-001 0013 schema mirror exposes removal and acceptance columns with active-only uniqueness',async()=>{
 const config=getTableConfig(knowledgeDecisions);
 expect(config.columns.map(c=>c.name)).toEqual(expect.arrayContaining(['removed_at','removed_by_member_id','accepted_revision_id']));
 expect(config.indexes.map(i=>i.config.name)).toContain('knowledge_decisions_active_page_idx');
 expect(config.indexes.map(i=>i.config.name)).not.toContain('knowledge_decisions_page_idx');
 expect(config.indexes.find(i=>i.config.name==='knowledge_decisions_active_page_idx')!.config.where).toBeDefined();
 const indexes=await rows("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='knowledge_decisions'");
 expect(indexes.some(i=>i.name==='knowledge_decisions_active_page_idx'&&String(i.sql).includes('WHERE removed_at IS NULL'))).toBe(true);
 expect(indexes.some(i=>i.name==='knowledge_decisions_page_idx')).toBe(false);
});
