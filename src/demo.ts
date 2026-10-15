import type { AppBindings } from './core/app/types';
import { createMemberRepository } from './core/features/session/repository';
import { slateSessions } from './core/features/session/auth';
import { readRuntimeConfig, isLocalOrigin } from './core/platform/config/runtime';
import { completeFirstRun } from './core/features/workspace/bootstrap';
import { createPage } from './core/features/pages/service';
import { createComment } from './core/features/comments/service';
import { createDatabase, saveField, createRecord } from './core/features/databases/service';
import { saveView } from './core/features/databases/views';
import { invite, acceptInvitation } from './core/features/workspace/invitations';
import { createD1DevelopmentOutbox } from '../modules/mail/src/development/index.mjs';
import { demoPages } from './demo/pages';

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
  const first = await completeFirstRun(ctx, { operationKey: 'demo:first-run', workspaceName: 'Northstar Studio', containerName: 'Team handbook', pageTitle: 'Welcome to Northstar' });
  const containerId = first.value.containerId;
  for (const page of demoPages) await createPage(ctx, { operationKey: `demo:page:${page.id}`, containerId, ...page });
  for (const email of ['maya.chen@demo.invalid', 'sam.rivera@demo.invalid']) {
    const existing = await slateSessions(env.DB, config).member('lower(email)=lower(?)', email);
    if (existing) continue;
    await invite(ctx, config, { operationKey: `demo:invite:${email.split('@')[0]}`, email, kind: 'member' });
    const messages = await createD1DevelopmentOutbox({ db: env.DB }).list();
    const message = messages.find(row => row.message.to.includes(email));
    const link = message?.message.text?.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error('Demo invitation was not captured');
    await acceptInvitation(env.DB, config, new URL(link).searchParams.get('token')!, { files: env.FILES, jobs: env.JOBS });
  }
  await createComment(ctx, 'demo-launch', { operationKey: 'demo:comment:launch', body: [{ text: 'The support walkthrough is ready. Please add feedback before Thursday’s review.' }] });
  await createComment(ctx, 'demo-decisions', { operationKey: 'demo:comment:decisions', body: [{ text: 'We agreed to start with the onboarding improvements and measure activation after two weeks.' }] });
  const database = await createDatabase(ctx, { operationKey: 'demo:database:projects', containerId, title: 'Project tracker' });
  const field = await saveField(ctx, database.value.id, { operationKey: 'demo:field:status', expectedRevisionId: database.value.revisionId, field: { id: 'demo-status', name: 'Status', type: 'text', position: 0, config: {} } });
  await saveView(ctx, database.value.id, { operationKey: 'demo:view:table', expectedRevisionId: field.receipt.revisionId, view: { id: 'demo-projects-table', name: 'All projects', layout: 'table', filters: [], sorts: [], groups: [], calculations: {}, display: {}, position: 0 } });
  for (const [index, title, status] of [['1', 'Customer onboarding refresh', 'In progress'], ['2', 'Help centre launch', 'In review'], ['3', 'Quarterly planning', 'Planned']]) {
    await createRecord(ctx, database.value.id, { operationKey: `demo:record:${index}`, title: title!, values: { 'demo-status': status! } });
  }
}
