import type { NativeDependencyAuthority } from '../../../../../modules/dependencies/index.mjs';
import type { Session } from '../../../../../modules/operator-auth/index.mjs';
import { mutationGuard } from '../../../app/operations';
import { actorFence, TENANT, type SessionStore, type SlateRole } from './store';

const INTERFACE = 'oidc-provider@1';
const iso = (now: number) => new Date(now).toISOString();
const refused = (error: unknown) => /constraint|core_write_guards/i.test(String(error));

/** Repeat the current native owner and fresh email proof in the committing batch. */
export function dependencyOwnerFence(store: SessionStore, actor: Pick<Session<SlateRole>, 'id' | 'operator'>, now: number) {
  const current = actorFence(actor, now, store.identityEnabled);
  return {
    sql: `${current.sql} AND ?=(SELECT id FROM members WHERE workspace_id=${TENANT} AND role='owner' AND status='active' ORDER BY is_setup_owner DESC,created_at,id LIMIT 1)
      AND EXISTS(SELECT 1 FROM sessions WHERE id=? AND proof_at>=? AND proof_at<=? AND proof_version=?)`,
    args: [...current.args, actor.operator.id, actor.id, now - 600000, now, actor.operator.version],
  };
}

/** Protocol fragments use only Slate's existing member/session authority. */
export function nativeDependencies(store: SessionStore): NativeDependencyAuthority<SlateRole> {
  const { db } = store;
  const revoke = (now: number) => db.prepare(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE provider_id='auth' AND member_id IN (SELECT id FROM members WHERE workspace_id=${TENANT})`).bind(iso(now), iso(now));
  return {
    // Slate claims owners by email. It does not offer the optional IdP owner-claim mode.
    async unclaimed() { return false; },
    ownerFence: (actor, now) => dependencyOwnerFence(store, actor, now),
    approvalFence: ({ pending, now }) => dependencyOwnerFence(store, {
      id: pending.approved_session,
      operator: { id: pending.approved_by, version: pending.approved_version } as Session<SlateRole>['operator'],
    }, now),
    linkedStatements: ({ contract, pending, issuer, now }) => contract === INTERFACE ? [
      revoke(now),
      db.prepare('INSERT INTO auth_identity_audit(id,actor_id,action,value,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), pending.approved_by, 'provider:link', issuer, now),
    ] : [],
    unlinkStatements: ({ contract, actor, now }) => contract === INTERFACE ? [
      revoke(now),
      db.prepare('INSERT INTO auth_identity_audit(id,actor_id,action,value,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), actor.operator.id, 'provider:unlink', contract, now),
    ] : [],
    async consumeLogout({ claims, link, now, fence }) {
      const issuer = claims.iss as string, sid = claims.sid as string | undefined;
      const subjects = (await db.prepare(`SELECT DISTINCT subject FROM sessions WHERE issuer=? AND provider_id='auth' AND (? IS NULL OR sid=?) AND member_id IN (SELECT id FROM members WHERE workspace_id=${TENANT})`).bind(issuer, sid ?? null, sid ?? null).all<{ subject: string }>()).results;
      if (sid && (!subjects.length || claims.sub && subjects.some(row => row.subject !== claims.sub))) return false;
      const subject = typeof claims.sub === 'string' ? claims.sub : subjects.length === 1 ? subjects[0]!.subject : null;
      if (!subject) return false;
      const member = await db.prepare(`SELECT b.member_id FROM member_identity_bindings b JOIN members m ON m.id=b.member_id WHERE b.issuer=? AND b.subject=? AND m.workspace_id=${TENANT}`).bind(issuer, subject).first<{ member_id: string }>();
      if (!member) return false;
      const statements = [
        db.prepare(`INSERT INTO auth_identity_logout(issuer,jti,consumed_at) VALUES(?,?,CASE WHEN EXISTS(SELECT 1 FROM rer_dependency_link WHERE interface=? AND issuer=? AND client_id=? AND metadata=? AND needs_relink=0 AND linked_at=?)
          AND EXISTS(SELECT 1 FROM member_identity_bindings b JOIN members m ON m.id=b.member_id WHERE b.issuer=? AND b.subject=? AND b.member_id=? AND m.workspace_id=${TENANT})
          AND (? IS NULL OR EXISTS(SELECT 1 FROM sessions WHERE issuer=? AND subject=? AND sid=? AND provider_id='auth' AND member_id=?)) THEN ? ELSE -1 END)`)
          .bind(issuer, claims.jti, INTERFACE, link.issuer, link.client_id, JSON.stringify(link.metadata), link.linked_at, issuer, subject, member.member_id, sid ?? null, issuer, subject, sid ?? null, member.member_id, now),
      ];
      if (fence) statements.push(db.prepare('INSERT INTO member_authority(member_id,version) VALUES(?,2) ON CONFLICT(member_id) DO UPDATE SET version=version+1').bind(member.member_id));
      statements.push(db.prepare(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE issuer=? AND subject=? AND provider_id='auth' AND member_id=? AND (? IS NULL OR sid=?)`).bind(iso(now), iso(now), issuer, subject, member.member_id, sid ?? null, sid ?? null));
      // An identity-fence revokes every native session for that member, including
      // legacy sessions without a recorded version. Plain logout affects only the linked provider.
      if (fence) statements.push(db.prepare('UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE member_id=?').bind(iso(now), iso(now), member.member_id));
      try { await db.batch(statements); return true; }
      catch (error) { if (refused(error)) return false; throw error; }
    },
  };
}

export async function setIdentitySettings(store: SessionStore, actor: Session<SlateRole>, enabled: boolean, now: number) {
  const { db } = store, fence = dependencyOwnerFence(store, actor, now);
  try {
    await db.batch([
      mutationGuard(db, `SELECT ${fence.sql}`, fence.args),
      db.prepare(`INSERT INTO auth_identity_audit(id,actor_id,action,value,created_at) SELECT ?,?,'idpSignIn',?,? FROM auth_identity_policy WHERE id=1 AND COALESCE(idp_sign_in,?)<>?`).bind(crypto.randomUUID(), actor.operator.id, String(enabled), now, Number(store.identityEnabled), Number(enabled)),
      db.prepare('UPDATE auth_identity_policy SET generation=generation+CASE WHEN COALESCE(idp_sign_in,?)<>? THEN 1 ELSE 0 END,idp_sign_in=? WHERE id=1').bind(Number(store.identityEnabled), Number(enabled), Number(enabled)),
      ...(!enabled ? [db.prepare(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE kind='oidc' AND member_id IN (SELECT id FROM members WHERE workspace_id=${TENANT})`).bind(iso(now), iso(now))] : []),
    ]);
    return true;
  } catch (error) { if (refused(error)) return false; throw error; }
}
