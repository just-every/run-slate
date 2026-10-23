import type { FeatureContext } from '../../app/feature-context';
import { commitOperation, mutationGuard } from '../../app/operations';
import { ApiProblem } from '../../app/problems';
import { createOpaqueToken, sha256 } from '../../platform/auth/token';
import { createUlid } from '../../shared/ulid';
import { currentSubject, requireContainerLevel, requireWorkspaceOwner } from '../sharing/current-access';
import { listContainers } from '../containers/service';
import { tokenInput, type TokenView } from './model';

export async function requireTokenMember(ctx: FeatureContext) {
  if ((await currentSubject(ctx)).isGuest) throw new ApiProblem(403, 'FORBIDDEN', 'Guests cannot manage API tokens.');
}

export async function tokenAdministration(ctx: FeatureContext) {
  await requireTokenMember(ctx);
  const owner = !!await ctx.db.prepare("SELECT id FROM members WHERE id=? AND role='owner' AND status='active'").bind(ctx.actor.id).first();
  const rows = await ctx.db.prepare(`SELECT t.id,t.member_id AS memberId,m.display_name AS memberName,t.name,t.scopes_json AS scopesJson,t.created_at AS createdAt,t.expires_at AS expiresAt,t.last_used_at AS lastUsedAt,t.revoked_at AS revokedAt FROM public_api_tokens t JOIN members m ON m.id=t.member_id WHERE t.workspace_id=? AND (? OR t.member_id=?) ORDER BY t.created_at DESC,t.id DESC`).bind(ctx.actor.workspaceId, owner ? 1 : 0, ctx.actor.id).all<Omit<TokenView, 'scopes'> & { scopesJson: string }>();
  return { owner, items: rows.results.map(({ scopesJson, ...row }) => ({ ...row, scopes: JSON.parse(scopesJson) as TokenView['scopes'] })), containers: (await listContainers(ctx)).items };
}

export async function mintToken(ctx: FeatureContext, raw: unknown) {
  const input = tokenInput.parse(raw), id = createUlid(), secret = createOpaqueToken();
  const expiresAt = input.expiresAt ?? new Date(Date.parse(ctx.now) + 90 * 86400000).toISOString();
  if (expiresAt <= ctx.now || Date.parse(expiresAt) > Date.parse(ctx.now) + 365 * 86400000) throw new ApiProblem(400, 'INVALID_EXPIRY', 'Choose a future expiry within one year.');
  const hash = await sha256(secret);
  const result = await commitOperation(ctx, {
    operationKey: input.operationKey, action: 'api-token.grant', request: input,
    authorize: async () => { await requireTokenMember(ctx); for (const scope of input.scopes) await requireContainerLevel(ctx, scope.containerId, scope.level === 'write' ? 'edit' : 'view'); },
    prepare: async ({ revisionId }) => ({ entity: { id, kind: 'api-token', revisionId }, value: { id, name: input.name, expiresAt, scopes: input.scopes }, detail: { name: input.name }, statements: [
      mutationGuard(ctx.db, "SELECT member_kind='member' AND status='active' FROM members WHERE id=?", [ctx.actor.id]),
      ctx.db.prepare('INSERT INTO public_api_tokens (id,workspace_id,member_id,name,token_hash,scopes_json,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, ctx.actor.workspaceId, ctx.actor.id, input.name, hash, JSON.stringify(input.scopes), ctx.now, expiresAt),
    ] }),
  });
  // Receipts contain metadata only. A replay cannot recover the secret.
  return { ...result, ...(result.value.id === id ? { secret } : {}) };
}

export async function revokeToken(ctx: FeatureContext, id: string, operationKey: string) {
  return commitOperation(ctx, { operationKey, action: 'api-token.revoke', request: { id }, authorize: async () => {
    await requireTokenMember(ctx);
    const token = await ctx.db.prepare('SELECT member_id FROM public_api_tokens WHERE id=? AND workspace_id=?').bind(id, ctx.actor.workspaceId).first<{ member_id: string }>();
    if (!token) throw new ApiProblem(404, 'NOT_FOUND', 'Not found.');
    if (token.member_id !== ctx.actor.id) await requireWorkspaceOwner(ctx);
  }, prepare: async ({ revisionId }) => { const token = await ctx.db.prepare('SELECT name FROM public_api_tokens WHERE id=?').bind(id).first<{name:string}>(); return { entity: { id, kind: 'api-token', revisionId }, value: { revoked: true }, detail: { name: token!.name }, statements: [ctx.db.prepare('UPDATE public_api_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(ctx.now, id)] }; } });
}
