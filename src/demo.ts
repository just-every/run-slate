import type { AppBindings } from './core/app/types';
import { createMemberRepository } from './core/features/session/repository';
import { slateSessions } from './core/features/session/auth';
import { readRuntimeConfig, isLocalOrigin } from './core/platform/config/runtime';
import { completeFirstRun } from './core/features/workspace/bootstrap';
import { readPage, createPage } from './core/features/pages/service';
import { createDatabase, saveField, createRecord } from './core/features/databases/service';
import { saveView } from './core/features/databases/views';
import { seedActivity } from './demo/activity';
import { seedTeam } from './demo/team';
import { replaceBlocks } from './core/features/editor/service';
import { demoPages } from './demo/pages';
import { seedIntelligence } from './demo/intelligence';

export async function demoOwner(env: AppBindings): Promise<string | null> {
  const row = await env.DB.prepare("SELECT email FROM members WHERE role='owner' AND status='active' ORDER BY is_setup_owner DESC,created_at,id LIMIT 1").first<{ email: string }>();
  return row?.email ?? null;
}

/** Real operations, with stable operation keys so an interrupted seed can resume. */
export async function seedDemo(env: AppBindings, { ownerEmail, now }: { ownerEmail: string; now: Date }): Promise<void> {
  const config = readRuntimeConfig(env, isLocalOrigin(env.APP_URL));
  const person = await slateSessions(env.DB, config).member('lower(email)=lower(?)', ownerEmail);
  const actor = person && await createMemberRepository(env.DB).getMember(person.id);
  if (!actor) throw new Error('Demo owner is unavailable');
  const ctx = { db: env.DB, files: env.FILES, jobs: env.JOBS, actor, now: now.toISOString() };
  const first = await completeFirstRun(ctx, { operationKey: 'demo:first-run', workspaceName: 'Slate', containerName: 'Team handbook', pageTitle: 'Welcome to Northstar' });
  const containerId = first.value.containerId;
  const welcome = await readPage(ctx, first.value.pageId);
  await replaceBlocks(ctx, first.value.pageId, { operationKey: 'demo:welcome:body', expectedRevisionId: welcome.page.revisionId, blocks: [{ id: 'demo-welcome', blockType: 'paragraph', treePosition: '001', content: { text: [{ text: 'Welcome to Northstar Studio. Our handbook brings together the people, decisions and projects behind our work. Start with the team guide, explore the autumn launch plan, or open the project tracker to see what is moving this week.' }] } }] });
  for (const page of demoPages) await createPage(ctx, { operationKey: `demo:page:${page.id}`, containerId, ...page });
  await seedTeam(ctx, config);
  const database = await createDatabase(ctx, { operationKey: 'demo:database:projects', containerId, title: 'Project tracker' });
  const field = await saveField(ctx, database.value.id, { operationKey: 'demo:field:status', expectedRevisionId: database.value.revisionId, field: { id: 'demo-status', name: 'Status', type: 'text', position: 0, config: {} } });
  await saveView(ctx, database.value.id, { operationKey: 'demo:view:table', expectedRevisionId: field.receipt.revisionId, view: { id: 'demo-projects-table', name: 'All projects', layout: 'table', filters: [], sorts: [], groups: [], calculations: {}, display: {}, position: 0 } });
  for (const [index, title, status] of [['1', 'Customer onboarding refresh', 'In progress'], ['2', 'Help centre launch', 'In review'], ['3', 'Quarterly planning', 'Planned']]) {
    await createRecord(ctx, database.value.id, { operationKey: `demo:record:${index}`, title: title!, values: { 'demo-status': status! } });
  }
  await seedActivity(ctx, config, containerId, database.value.id);
  await seedIntelligence(ctx);
}
