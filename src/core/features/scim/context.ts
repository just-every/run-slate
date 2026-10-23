import type { Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import type { FeatureContext } from '../../app/feature-context';
import { featureContext } from '../../app/feature-context';
import { mutationGuard } from '../../app/operations';
import { sha256 } from '../../platform/auth/token';
import { createMemberRepository } from '../session/repository';
import { ScimError } from './protocol';
export interface ScimContext extends FeatureContext { scimCredential: { id: string; name: string; hash: string }; operationKey: string }
export function ownerGuard(ctx: FeatureContext) {
  return mutationGuard(ctx.db, "SELECT role='owner' AND member_kind='member' AND status='active' AND workspace_id=? FROM members WHERE id=?", [ctx.actor.workspaceId,ctx.actor.id]);
}
export async function authenticateScim(c: Context<AppEnvironment>): Promise<ScimContext> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(c.req.header('authorization') ?? '');
  if (!match) throw new ScimError(401, 'A valid SCIM bearer credential is required.');
  const hash = await sha256(match[1]!);
  const row = await c.env.DB.prepare("SELECT c.id,c.name,c.owner_member_id FROM scim_credentials c JOIN members m ON m.id=c.owner_member_id WHERE c.token_hash=? AND c.revoked_at IS NULL AND m.workspace_id=c.workspace_id AND m.status='active' AND m.role='owner' AND m.member_kind='member'").bind(hash).first<{id:string;name:string;owner_member_id:string}>();
  if (!row) throw new ScimError(401, 'A valid SCIM bearer credential is required.');
  const member = await createMemberRepository(c.env.DB).getMember(row.owner_member_id);
  if (!member) throw new ScimError(401, 'The SCIM credential owner is unavailable.');
  c.set('member', member);
  const ctx: ScimContext = { ...featureContext(c), scimCredential: { id: row.id, name: row.name, hash }, operationKey: `scim:${row.id}:${crypto.randomUUID()}` };
  ctx.credentialGuard = () => mutationGuard(ctx.db, "SELECT c.token_hash=? AND c.revoked_at IS NULL AND m.status='active' AND m.role='owner' AND m.member_kind='member' AND m.workspace_id=c.workspace_id FROM scim_credentials c JOIN members m ON m.id=c.owner_member_id WHERE c.id=? AND c.owner_member_id=? AND c.workspace_id=?", [hash,row.id,ctx.actor.id,ctx.actor.workspaceId]);
  return ctx;
}
/** Native services still own admission and receipts. Extra mapping writes share their atomic D1 batch. */
export function nativeCommitContext(ctx: ScimContext, operationKey: string, before: D1PreparedStatement[] = [], after: D1PreparedStatement[] = []): FeatureContext {
  return { ...ctx, operationStatements: { before, after: [...after,
    ctx.db.prepare("UPDATE activity_entries SET detail_json=json_set(detail_json,'$.scimCredential',json_object('id',?,'name',?),'$.actorLabel',?) WHERE workspace_id=? AND actor_member_id=? AND operation_key=?").bind(ctx.scimCredential.id,ctx.scimCredential.name,`SCIM: ${ctx.scimCredential.name}`,ctx.actor.workspaceId,ctx.actor.id,operationKey),
    ctx.db.prepare('UPDATE scim_credentials SET last_used_at=? WHERE id=?').bind(ctx.now,ctx.scimCredential.id),
  ] } };
}

/** Reads and discovery carry the same credential label in the native activity ledger. */
export async function auditScimRead(ctx: ScimContext, action: string, targetId = ctx.scimCredential.id) {
  await ctx.db.batch([ctx.credentialGuard!(),ctx.db.prepare("INSERT INTO activity_entries (id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) VALUES (?,?,?,'scim',?,'scim-credential',?,?,?)").bind(crypto.randomUUID(),ctx.actor.workspaceId,ctx.actor.id,`scim.${action}`,targetId,JSON.stringify({scimCredential:{id:ctx.scimCredential.id,name:ctx.scimCredential.name},actorLabel:`SCIM: ${ctx.scimCredential.name}`}),ctx.now),ctx.db.prepare('UPDATE scim_credentials SET last_used_at=? WHERE id=?').bind(ctx.now,ctx.scimCredential.id)]);
}
