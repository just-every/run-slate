import { env } from 'cloudflare:test';
import { fixture as measuredFixture } from '../../../qualification/inquiry/fixture';
import { seedContainer, seedPage, seedPageGrant } from '../../../e2e/setup/fixtures';
import type { EvidenceInput } from '../../../../src/core/features/ai/contracts';
import { createSkill } from '../../../../src/core/features/skills/service';
import { prepareEvaluation } from '../../../../src/core/features/skills/evaluation-workflow';
import { saveGrant } from '../../../../src/core/features/sharing/grants';

export async function prepareComparison(withRevocableSource = false) {
  const f = await measuredFixture();
  const source = withRevocableSource ? await privateSourceFor(f) : null;
  const refs: EvidenceInput[] = source ? [source.ref] : f.refs;
  const definition = {
    instructions: 'Use only the exact source revision in the comparison packet.',
    refs,
    audience: [f.owner],
    tools: ['read-evidence' as const],
    effects: [],
    preconditions: ['The source revision remains readable.'],
    successTests: ['Identify the unresolved handoff'],
    escalations: ['The source or its authority is unavailable.'],
    maxCostMicros: 1_000_000,
  };
  const skill = await createSkill(f.context(), {
    operationKey: `${f.workspaceId}:u7-create-method`,
    pageId: f.page.pageId,
    name: 'U7 frozen comparison method',
    definition,
  });
  const prepared = await prepareEvaluation(f.context(), skill.value.id, {
    operationKey: `${f.workspaceId}:u7-prepare-comparison`,
    question: 'Which handoff does the exact source leave unresolved?',
  }, { apiKey: 'TEST-ONLY-NO-SEND' });

  if (!prepared.candidateRunId || !prepared.genericRunId) {
    throw new Error(`Expected both native comparison runs, got ${JSON.stringify(prepared)}.`);
  }
  return { f, skill, definition, refs, source, prepared };
}

async function privateSourceFor(f: Awaited<ReturnType<typeof measuredFixture>>) {
  const container = await seedContainer(f.workspaceId, {
    ownerMemberId: f.reader,
    visibility: 'closed',
    name: 'U7 private source container',
  });
  const page = await seedPage(container.containerId, {
    title: 'U7 private source',
    authorMemberId: f.reader,
  });
  const ref: EvidenceInput = {
    kind: 'page',
    sourceId: page.pageId,
    revisionId: page.workingRevisionId,
  };
  await env.DB.prepare(`INSERT INTO page_revisions
    (id,page_id,author_member_id,origin,content_hash,body_json,properties_json,created_at)
    VALUES(?,?,?,'autosave',?,?,?,?)`)
    .bind(
      page.workingRevisionId,
      page.pageId,
      f.reader,
      'u7-private-source-revision',
      JSON.stringify([{ text: 'The support handoff remains open.' }]),
      JSON.stringify({ title: 'U7 private source' }),
      new Date().toISOString(),
    ).run();
  await env.DB.prepare('INSERT INTO content_published_revisions(page_id,revision_id) VALUES(?,?)')
    .bind(page.pageId, page.workingRevisionId).run();
  await env.DB.prepare('UPDATE pages SET published_revision_id=? WHERE id=?')
    .bind(page.workingRevisionId, page.pageId).run();

  const readerGrant = await seedPageGrant(page.pageId, {
    principalKind: 'member', principalId: f.reader, level: 'full',
  });
  const ownerGrant = await saveGrant(f.context(f.reader), {
    operationKey: `${f.workspaceId}:u7-share-source`,
    targetKind: 'page',
    targetId: page.pageId,
    principalKind: 'member',
    principalId: f.owner,
    level: 'view',
  });
  if (!ownerGrant.value.id || ownerGrant.value.id === readerGrant.grantId) {
    throw new Error('The source service did not issue a distinct owner access grant.');
  }
  return { page, ref, ownerGrantId: ownerGrant.value.id };
}

export async function revokePreparedSourceGrant(
  f: Awaited<ReturnType<typeof measuredFixture>>,
  source: NonNullable<Awaited<ReturnType<typeof prepareComparison>>['source']>,
) {
  const result = await saveGrant(f.context(f.reader), {
    operationKey: `${f.workspaceId}:u7-revoke-source`,
    targetKind: 'page',
    targetId: source.page.pageId,
    id: source.ownerGrantId,
    principalKind: 'member',
    principalId: f.owner,
    level: 'view',
    revoke: true,
  });
  if (!result.value.revoked) throw new Error('The source grant revocation was not committed.');
}
