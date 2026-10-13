import type { NativeProofPersistence } from '../../../../../modules/operator-auth/identity/email-link/index.mjs';
import { mutationGuard } from '../../../app/operations';
import { actorFence, guard, personFence, TENANT, version, type SessionStore, type SlatePerson, type SlateRole } from './store';

interface ProofRow { kind: 'magic' | 'step_up'; member_id: string; authority_version: number; email: string; expires_at: number; return_to: string }

/**
 * Base's email-link and step-up persistence over `auth_proofs`. Consumption,
 * the current-authority recheck and session issuance or proof recording are
 * one D1 batch; a refused guard aborts all of it.
 */
export function createNativeProofs(store: SessionStore): NativeProofPersistence<SlateRole> {
  const { db } = store;
  const live = async (hash: string, now: number, kind: ProofRow['kind']) => db.prepare(`SELECT r.* FROM auth_proofs r JOIN members m ON m.id=r.member_id
    WHERE r.hash=? AND r.kind=? AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at>? AND m.workspace_id=${TENANT} AND m.status='active'
      AND ${version('m')}=r.authority_version AND lower(m.email)=r.email`).bind(hash, kind, now).first<ProofRow>();
  const inserted = (result: D1Result) => result.meta.changes === 1;
  const refused = (cause: unknown) => String(cause).includes('core_write_guards') || String(cause).includes('CHECK constraint');
  return {
    async limits(keys, now, windowMs) {
      return Promise.all(keys.map(async key => (await db.prepare(`INSERT INTO auth_limits (key,count,start) VALUES (?,1,?)
        ON CONFLICT(key) DO UPDATE SET count=CASE WHEN start<=? THEN 1 ELSE count+1 END,start=CASE WHEN start<=? THEN ? ELSE start END RETURNING count`)
        .bind(key, now, now - windowMs, now - windowMs, now).first<{ count: number }>())!.count));
    },
    async token(record) {
      const person = await store.member('id=?', record.operatorId);
      if (!person || person.status !== 'active' || person.version !== record.expectedVersion) return false;
      const fence = personFence(person);
      return inserted(await db.prepare(`INSERT INTO auth_proofs (id,hash,kind,member_id,authority_version,email,return_to,created_at,expires_at) SELECT ?,?,'magic',?,?,?,?,?,? WHERE ${fence.sql}`)
        .bind(record.id, record.hash, person.id, person.version, person.email, record.returnTo, record.now, record.expiresAt, ...fence.args).run());
    },
    async preview(digest, now) {
      const row = await live(digest, now, 'magic');
      return row ? { kind: 'magic', email: row.email, operatorId: row.member_id, version: row.authority_version, expiresAt: row.expires_at, returnTo: row.return_to } : null;
    },
    async consumeLink({ digest, person, now, returnTo }) {
      // An email confirmation is itself a fresh app-local proof for step-up.
      return store.issue({ person: person as SlatePerson, kind: 'native', now, returnTo, freshProof: true, statements: [
        db.prepare("UPDATE auth_proofs SET used_at=? WHERE hash=? AND kind='magic' AND member_id=? AND authority_version=? AND email=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?")
          .bind(now, digest, person.id, person.version, person.email, now),
        mutationGuard(db, 'SELECT changes()=1', []),
      ] });
    },
    revokeLink: (id, now) => db.prepare('UPDATE auth_proofs SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(now, id).run(),
    async stepUpPreview(digest, now) {
      const row = await live(digest, now, 'step_up');
      return row ? { expiresAt: row.expires_at } : null;
    },
    async stepUpChallenge(record, actor) {
      const fence = actorFence(actor, record.now, store.identityEnabled);
      return inserted(await db.prepare(`INSERT INTO auth_proofs (id,hash,kind,member_id,authority_version,email,session_id,action,return_to,created_at,expires_at) SELECT ?,?,'step_up',?,?,?,?,?,?,?,? WHERE ${fence.sql}`)
        .bind(record.id, record.hash, actor.operator.id, actor.operator.version, actor.operator.email, actor.id, record.action, record.returnTo, record.now, record.expiresAt, ...fence.args).run());
    },
    async consumeStepUp(digest, actor, now) {
      try {
        const results = await db.batch([
          guard(db, actorFence(actor, now, store.identityEnabled)),
          db.prepare("UPDATE auth_proofs SET used_at=? WHERE hash=? AND kind='step_up' AND member_id=? AND authority_version=? AND session_id=? AND email=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? RETURNING action, return_to AS returnTo")
            .bind(now, digest, actor.operator.id, actor.operator.version, actor.id, actor.operator.email, now),
          mutationGuard(db, 'SELECT changes()=1', []),
          db.prepare('UPDATE sessions SET proof_at=?,proof_version=? WHERE id=?').bind(now, actor.operator.version, actor.id),
        ]);
        return (results[1]!.results[0] as { action: never; returnTo: string } | undefined) ?? null;
      } catch (cause) {
        if (refused(cause)) return null;
        throw cause;
      }
    },
    revokeStepUp: (id, now) => db.prepare('UPDATE auth_proofs SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').bind(now, id).run(),
    async steppedUp(actor, since, now) {
      const fence = actorFence(actor, now, store.identityEnabled);
      return !!await db.prepare(`SELECT 1 FROM sessions WHERE id=? AND proof_at>=? AND proof_at<=? AND proof_version=? AND ${fence.sql}`)
        .bind(actor.id, since, now, actor.operator.version, ...fence.args).first();
    },
  };
}
