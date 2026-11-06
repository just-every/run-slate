import { z } from 'zod';
import seed from '../../../../seed.json';
import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createUlid } from '../../shared/ulid';
import { notificationStatements } from '../notifications/events';
import { recipientContext } from '../notifications/outbox';
import { identityRevision } from '../workspace/revisions';
import { requireConfiguredLevel } from './configuration';
import { requirePageLevel, resolveCurrentAccess } from './current-access';

const ids = z.array(z.string().min(1).max(128)).min(1).max(50).refine(items => new Set(items).size === items.length);
export const messageInput = z.object({
  memberIds: ids,
  message: z.string().max(seed.limits.shareMessageCharacters).default(''),
}).strict();
export const sendMessageInput = messageInput.extend({
  operationKey: z.string().min(8).max(160),
  grantMemberIds: z.array(z.string().min(1).max(128)).max(50),
}).strict();
type MessageInput = z.infer<typeof messageInput>;

async function authorize(ctx: FeatureContext, pageId: string) {
  const access = await requirePageLevel(ctx, pageId, 'full');
  if (access.subject.isGuest) throw new ApiProblem(403, 'MEMBERS_ONLY', 'Only workspace members can send a page.');
  const container = await ctx.db.prepare('SELECT visibility FROM containers WHERE id=?').bind(access.context.container.id).first<{visibility:string}>();
  if (container?.visibility === 'personal') throw new ApiProblem(403, 'PERSONAL_PRIVATE', 'A personal space cannot be shared.');
}
async function recipients(ctx: FeatureContext, pageId: string, memberIds: string[]) {
  const items = [];
  for (const id of memberIds) {
    const member = await ctx.db.prepare("SELECT display_name AS displayName FROM members WHERE id=? AND workspace_id=? AND status='active' AND member_kind='member' AND id!=?")
      .bind(id, ctx.actor.workspaceId, ctx.actor.id).first<{displayName:string}>();
    if (!member) throw new ApiProblem(400, 'RECIPIENT_UNAVAILABLE', 'Choose other active workspace members.');
    const recipient = await recipientContext(ctx, id);
    let readable = false;
    if (recipient) {
      try { readable = (await resolveCurrentAccess(recipient, pageId)).decision.allowed; }
      catch (cause) { if (!(cause instanceof ApiProblem && cause.status === 404)) throw cause; }
    }
    items.push({ id, displayName: member.displayName, readable });
  }
  return items;
}
/** A read-only review. Selecting a recipient never grants access or queues a notice. */
export async function previewMessage(ctx: FeatureContext, pageId: string, input: MessageInput) {
  await authorize(ctx, pageId);
  return { items: await recipients(ctx, pageId, input.memberIds) };
}
export async function sendMessage(ctx: FeatureContext, pageId: string, input: z.infer<typeof sendMessageInput>) {
  return commitOperation(ctx, {
    operationKey: input.operationKey, action: 'sharing.message', request: { pageId, ...input },
    authorize: () => authorize(ctx, pageId),
    prepare: async () => {
      const items = await recipients(ctx, pageId, input.memberIds);
      if (new Set(input.grantMemberIds).size !== input.grantMemberIds.length || input.grantMemberIds.some(id => !input.memberIds.includes(id)))
        throw new ApiProblem(400, 'INVALID_GRANT_CONSENT', 'Grant consent must name selected recipients only.');
      const missing = items.filter(item => !item.readable);
      if (missing.some(item => !input.grantMemberIds.includes(item.id)))
        throw new ApiProblem(409, 'ACCESS_GRANT_REQUIRED', 'Review current access and explicitly add the offered grant before sending.');
      if (missing.length) await requireConfiguredLevel(ctx, 'view');
      const statements: D1PreparedStatement[] = [];
      const grantIds: string[] = [];
      for (const item of items) statements.push(mutationGuard(ctx.db,
        "SELECT status='active' AND member_kind='member' FROM members WHERE id=? AND workspace_id=?", [item.id, ctx.actor.workspaceId]));
      for (const item of missing) {
        const id = createUlid();
        grantIds.push(id);
        statements.push(ctx.db.prepare("INSERT INTO page_grants(id,page_id,principal_kind,principal_id,level,created_at,updated_at) VALUES(?,?,'member',?,'view',?,?)")
          .bind(id, pageId, item.id, ctx.now, ctx.now));
        statements.push(await identityRevision(ctx, createUlid(), 'page-grant', id, { targetId: pageId, principalKind: 'member', principalId: item.id, level: 'view', expiresAt: null, revoked: false }));
      }
      // One logical share event, including when it atomically adds accepted grants.
      // No separate access-granted notice and no page content write.
      statements.push(...notificationStatements(ctx, { id: createUlid(), event: 'share-message', pageId,
        recipientIds: items.map(item => item.id), detail: { shareMessage: { senderMemberId: ctx.actor.id, message: input.message } } }));
      const page = await ctx.db.prepare('SELECT revision_id FROM pages WHERE id=?').bind(pageId).first<{revision_id:string}>();
      return { entity: { kind: 'page', id: pageId, revisionId: page!.revision_id }, value: { sent: items.length, grantIds },
        detail: { shareMessage: input.message, grantIds }, statements };
    },
  });
}
