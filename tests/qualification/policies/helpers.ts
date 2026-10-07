import { env } from 'cloudflare:test';
import { seedWorkspace, seedMember, seedContainer, seedContainerGrant } from '../../e2e/setup/fixtures';
import type { FeatureContext } from '../../../src/core/app/feature-context';
import { readWorkspace, updateWorkspace } from '../../../src/core/features/workspace/settings';
import type { KnowledgePolicyProfile } from '../../../src/core/shared/knowledge/policies';
export async function scenario() {
    const { workspaceId } = await seedWorkspace();
    const actor = async (role: 'owner' | 'member', name: string, isGuest = false) => { const { memberId } = await seedMember(workspaceId, { role, email: `${name}-${workspaceId}@test.invalid`, displayName: name, isGuest }); return { db: env.DB, files: env.FILES, jobs: env.JOBS, now: new Date().toISOString(), actor: { id: memberId, workspaceId, workspaceName: 'Qualification', email: `${name}@test.invalid`, displayName: name, initials: 'QA', role } } as FeatureContext; };
    const owner = await actor('owner', 'Owner'), reader = await actor('member', 'Reader'), guest = await actor('member', 'Guest', true), outsider = await actor('owner', 'OtherOwner');
    const { containerId } = await seedContainer(workspaceId, { ownerMemberId: owner.actor.id, visibility: 'private' });
    await seedContainerGrant(containerId, { principalKind: 'member', principalId: owner.actor.id, level: 'full' });
    return { owner, reader, guest, outsider, containerId };
}
let sequence = 0;
export const key = (prefix: string) => `qualification-${prefix}-${++sequence}`;
export async function profile(ctx: FeatureContext, policies: Partial<KnowledgePolicyProfile>) { const w = await readWorkspace(ctx); return updateWorkspace(ctx, { ...w, operationKey: key('policy'), expectedRevisionId: w.revisionId, policies: { ...w.policies, ...policies } }); }
export async function rows(sql: string, ...args: unknown[]) { return (await env.DB.prepare(sql).bind(...args).all()).results; }
export const textBlock = (id: string, text: string) => ({ id, blockType: 'paragraph', treePosition: '1', content: { text: [{ text }] } });
