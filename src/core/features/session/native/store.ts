import { nativeSamlPolicy, sessionSamlPolicy, samlSessionValid } from '../saml/policy';
import { personDisplayName, personInitials } from '../../../shared/person-identity';
import type { AuthenticatedMember } from "../../../app/types";
import type { CompletedSession, Session } from '../../../../../modules/operator-auth/index.mjs';
import type { NativePerson } from '../../../../../modules/operator-auth/accounts/native.mjs';
import { createSessionCookie, readCookie, SESSION_COOKIE_NAME } from '../../../platform/auth/cookie';
import { safeAppPath } from '../../../platform/auth/paths';
import { createOpaqueToken, sessionDigest } from '../../../platform/auth/token';
import { mutationGuard } from '../../../app/operations';
import { createUlid } from '../../../shared/ulid';

export type SlateRole = 'owner' | 'member';
export type SlatePerson = NativePerson<SlateRole> & { memberKind: 'member' | 'guest' };
export type SlateSession = Omit<Session<SlateRole>, 'operator'> & { operator: SlatePerson; hash: string; member: AuthenticatedMember; authProtocol: 'saml' | null };

/**
 * The installation's workspace, selected by the server and never by identity
 * input. Admission, proofs and owner lookups are scoped to it. A session is
 * bound to one member, and that member to one workspace, as before.
 */
export const TENANT = '(SELECT id FROM workspaces ORDER BY created_at, id LIMIT 1)';
/** A member's authority version: 1 until a fenced change advances it in member_authority. */
export const version = (member: string) => `COALESCE((SELECT version FROM member_authority WHERE member_id=${member}.id),1)`;
const DAY = 86_400_000;
/** Existing native contract for email sessions; provider sessions are capped by Base at 24 hours. */
export const LIFETIME = { native: 30 * DAY, oidc: DAY, dev: 7 * DAY } as const;
const iso = (ms: number) => new Date(ms).toISOString();

export interface MemberRow {
  id: string; email: string; display_name: string; role: SlateRole; member_kind: 'member' | 'guest';
  status: string; authority_version: number; created_at: string;
}

export function personOf(row: MemberRow | null): SlatePerson | null {
  if (!row) return null;
  const active = row.status === 'active';
  return {
    id: row.id, email: row.email.toLowerCase(), role: row.role, status: active ? 'active' : 'inactive',
    owner: active && row.role === 'owner', version: row.authority_version, displayName: personDisplayName(row.display_name, row.email),
    createdAt: Date.parse(row.created_at), memberKind: row.member_kind,
  };
}

/** Current tenant, ID, email, version and active status, in SQL a batch guard can repeat. */
export function personFence(person: { id: string; email: string; version: number }) {
  return { sql: `EXISTS(SELECT 1 FROM members m WHERE m.id=? AND m.workspace_id=${TENANT} AND lower(m.email)=? AND ${version('m')}=? AND m.status='active')`, args: [person.id, person.email, person.version] };
}

const PROVIDER_PIN = "(s.provider_id IS NULL OR EXISTS(SELECT 1 FROM oa_identity_providers ip WHERE ip.provider_id=s.provider_id AND ip.issuer=s.issuer AND ip.linked_at=s.provider_linked_at AND ip.status='linked'))";
const identityPolicy = "((s.provider_id='auth' OR ?=1) AND COALESCE((SELECT idp_sign_in FROM auth_identity_policy WHERE id=1),?)=1)";
const PROVIDER_SESSION = `(s.created_at>? AND s.provider_generation=(SELECT generation FROM auth_identity_policy WHERE id=1) AND ${PROVIDER_PIN} AND EXISTS(SELECT 1 FROM member_identity_bindings b WHERE b.issuer=s.issuer AND b.subject=s.subject AND b.member_id=s.member_id))`;

/**
 * The asking session still holds current authority: same person and version,
 * active, unrevoked and unexpired; a provider session also keeps its 24-hour cap,
 * policy generation, pin and binding. Sessions from before Base adoption carry
 * no version and keep their existing native contract.
 */
export function actorFence(actor: { id: string; operator: { id: string; version: number } }, now: number, identityEnabled: boolean) {
  return {
    sql: `EXISTS(SELECT 1 FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.id=? AND m.id=? AND m.workspace_id=${TENANT} AND ${version('m')}=? AND m.status='active' AND s.revoked_at IS NULL AND s.expires_at>? AND (s.kind IS NULL OR s.authority_version=${version('m')}) AND ${sessionSamlPolicy('s','m')} AND ${samlSessionValid('s','m')} AND (s.kind IS NOT 'oidc' OR (${identityPolicy} AND ${PROVIDER_SESSION})))`,
    args: [actor.id, actor.operator.id, actor.operator.version, iso(now), Number(identityEnabled), Number(identityEnabled), iso(now - LIFETIME.oidc)],
  };
}

export const guard = (db: D1Database, fence: { sql: string; args: (string | number | null)[] }) => mutationGuard(db, `SELECT ${fence.sql}`, fence.args);

export interface SessionStore {
  readonly db: D1Database;
  readonly secret: string;
  readonly secure: boolean;
  readonly identityEnabled: boolean;
  member(sql: string, ...args: (string | number)[]): Promise<SlatePerson | null>;
  read(request: Request, now: number): Promise<SlateSession | null>;
  issue(input: { person: SlatePerson; kind: 'native' | 'oidc' | 'dev'; now: number; returnTo?: string; statements?: D1PreparedStatement[]; principal?: ProviderPrincipal; freshProof?: boolean; saml?: { generation: number } }): Promise<CompletedSession<SlateRole> | null>;
  revokeToken(request: Request, now: number): Promise<void>;
  cookie(token: string, expiresAt: string): string;
}
export interface ProviderPrincipal { issuer: string; subject: string; sid?: string; providerGeneration: number; providerPin?: { id: string; linkedAt: number } }

/** Sessions keep Slate's cookie and keyed token digest, so existing sessions stay readable. */
export function sessionStore(db: D1Database, input: { secret: string; secure: boolean; identityEnabled: boolean; devAdmitted: (request: Request) => Promise<boolean> }): SessionStore {
  const { secret, secure, identityEnabled } = input;
  const cookie = (token: string, expiresAt: string) => createSessionCookie(token, expiresAt, secure);
  async function member(sql: string, ...args: (string | number)[]) {
    return personOf(await db.prepare(`SELECT members.*, ${version('members')} AS authority_version FROM members WHERE workspace_id=${TENANT} AND ${sql} LIMIT 1`).bind(...args).first<MemberRow>());
  }
  return {
    db, secret, secure, identityEnabled, member, cookie,
    async read(request, now) {
      const token = readCookie(request.headers, SESSION_COOKIE_NAME);
      if (!token) return null;
      const row = await db.prepare(`SELECT s.id AS session_id,s.kind,s.auth_protocol,s.created_at AS session_created_at,s.expires_at,s.issuer,s.subject,s.sid,s.token_digest,m.*,w.name AS workspace_name,${version('m')} AS authority_version FROM sessions s JOIN members m ON m.id=s.member_id JOIN workspaces w ON w.id=m.workspace_id
        WHERE s.token_digest=? AND m.workspace_id=${TENANT} AND s.revoked_at IS NULL AND s.expires_at>? AND m.status='active'
          AND (s.kind IS NULL OR s.authority_version=${version('m')}) AND ${sessionSamlPolicy('s','m')} AND ${samlSessionValid('s','m')} AND (s.kind IS NOT 'oidc' OR (${identityPolicy} AND ${PROVIDER_SESSION}))`)
        .bind(await sessionDigest(secret, token), iso(now), Number(identityEnabled), Number(identityEnabled), iso(now - LIFETIME.oidc))
        .first<MemberRow & { workspace_id: string; workspace_name: string; initials: string; session_id: string; kind: SlateSession['kind'] | null; auth_protocol: 'saml' | null; session_created_at: string; expires_at: string; issuer: string | null; subject: string | null; sid: string | null; token_digest: string }>();
      if (!row) return null;
      // A dev session counts only on a request that passes the local key gate.
      if (row.kind === 'dev' && !await input.devAdmitted(request)) return null;
      return {
        member: { id:row.id, workspaceId:row.workspace_id, workspaceName:row.workspace_name, email:row.email, displayName:personDisplayName(row.display_name,row.email), initials:personInitials(row.display_name,row.email), role:row.role },
        authProtocol: row.auth_protocol, hash: row.token_digest, id: row.session_id, kind: row.kind ?? 'native', operatorId: row.id, operator: personOf(row)!,
        createdAt: Date.parse(row.session_created_at), expiresAt: Date.parse(row.expires_at),
        ...(row.issuer ? { issuer: row.issuer, subject: row.subject ?? undefined, sid: row.sid ?? undefined } : {}),
      };
    },
    // SAML is a native-adapter session with an explicit protocol marker. Base's
    // oidc kind belongs only to its OIDC policy toggle. The SAML marker keeps
    // its own provider generation, binding, enforcement and 24-hour lifetime.
    async issue({ person, kind, now, returnTo, statements = [], principal, freshProof = false, saml }) {
      const id = createUlid(), token = createOpaqueToken(), createdAt = iso(now), expiresAt = iso(now + (saml ? LIFETIME.oidc : LIFETIME[kind]));
      try {
        await db.batch([
          ...statements,
          guard(db, personFence(person)),
          ...(!saml ? [mutationGuard(db, `SELECT ${nativeSamlPolicy('m', kind === 'native')} FROM members m WHERE m.id=?`, [person.id])] : []),
          ...(saml ? [mutationGuard(db, `SELECT enabled=1 AND generation=? FROM saml_provider_config WHERE workspace_id=${TENANT}`, [saml.generation])] : []),
          db.prepare(`INSERT INTO sessions (id,member_id,token_digest,created_at,updated_at,expires_at,kind,authority_version,issuer,subject,sid,provider_id,provider_linked_at,provider_generation,proof_at,proof_version,auth_protocol,saml_generation)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, person.id, await sessionDigest(secret, token), createdAt, createdAt, expiresAt, kind, person.version,
            principal?.issuer ?? null, principal?.subject ?? null, principal?.sid ?? null, principal?.providerPin?.id ?? null, principal?.providerPin?.linkedAt ?? null,
            principal?.providerGeneration ?? null, freshProof ? now : null, freshProof ? person.version : null, saml ? 'saml' : null, saml?.generation ?? null),
        ]);
      } catch (cause) {
        if (String(cause).includes('core_write_guards') || String(cause).includes('CHECK constraint') || String(cause).includes('UNIQUE constraint')) return null;
        throw cause;
      }
      return { session: { id, kind, createdAt: now, expiresAt: Date.parse(expiresAt) }, operator: person, cookie: cookie(token, expiresAt), returnTo: safeAppPath(returnTo) };
    },
    async revokeToken(request, now) {
      const token = readCookie(request.headers, SESSION_COOKIE_NAME);
      if (!token) return;
      await db.prepare('UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE token_digest=?')
        .bind(iso(now), iso(now), await sessionDigest(secret, token)).run();
    },
  };
}
