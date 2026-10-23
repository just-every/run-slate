import type { Context } from 'hono';
import type { AppEnvironment } from '../../app/types';
import { ApiProblem } from '../../app/problems';
import { sha256 } from '../../platform/auth/token';
import { createMemberRepository } from '../session/repository';
import { scopesSchema, type TokenPrincipal } from './model';
import limits from '../../../../seed.json';

export async function authenticateToken(c: Context<AppEnvironment>): Promise<TokenPrincipal> {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(c.req.header('authorization') ?? '');
  const denied = () => new ApiProblem(401, 'UNAUTHENTICATED', 'A valid API token is required.');
  if (!match) throw denied();
  const now = new Date().toISOString(), db = c.env.DB;
  const token = await db.prepare('SELECT id,member_id,scopes_json,expires_at,revoked_at FROM public_api_tokens WHERE token_hash=?').bind(await sha256(match[1]!)).first<{ id: string; member_id: string; scopes_json: string; expires_at: string; revoked_at: string | null }>();
  if (!token || token.revoked_at) throw denied();
  if (token.expires_at <= now) {
    await tokenActivity(db, token.id, 'expired', now);
    throw denied();
  }
  const [member, standing] = await Promise.all([
    createMemberRepository(db).getMember(token.member_id),
    db.prepare('SELECT member_kind FROM members WHERE id=?').bind(token.member_id).first<{ member_kind: string }>(),
  ]);
  if (!member || standing?.member_kind !== 'member') throw denied();
  const scopes = scopesSchema.safeParse(JSON.parse(token.scopes_json));
  if (!scopes.success) throw denied();
  const bucket = Math.floor(Date.now() / 60000), end = new Date((bucket + 1) * 60000).toISOString();
  const count = await db.prepare('INSERT INTO request_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(`api-token:${token.id}:${bucket}`, end).first<number>('count');
  if ((count ?? 0) > limits.limits.publicApiRequestsPerTokenPerMinute) { c.header('Retry-After', String(Math.max(1, Math.ceil((Date.parse(end) - Date.now()) / 1000)))); throw new ApiProblem(429, 'RATE_LIMITED', 'The token request limit was reached. Try again later.'); }
  await tokenActivity(db, token.id, 'use', now);
  return { id: token.id, member, scopes: scopes.data };
}

async function tokenActivity(db: D1Database, id: string, action: 'use' | 'expired', now: string) {
  const minute = now.slice(0, 16) + ':00.000Z';
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO activity_entries (id,workspace_id,actor_member_id,feature,action,target_kind,target_id,detail_json,occurred_at) SELECT ?,workspace_id,member_id,'api-token',?,'api-token',id,json_object('name',name),? FROM public_api_tokens WHERE id=? ${action === 'use' ? 'AND (last_used_at IS NULL OR last_used_at<?)' : ''}`).bind(`${id}:${action}:${action === 'use' ? minute : 'once'}`, `api-token.${action}`, now, id, ...(action === 'use' ? [minute] : [])),
    ...(action === 'use' ? [db.prepare('UPDATE public_api_tokens SET last_used_at=? WHERE id=? AND (last_used_at IS NULL OR last_used_at<?)').bind(minute, id, minute)] : []),
  ]);
}
