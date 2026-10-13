import type { NativeAccountsAdapter } from '../../../../../modules/operator-auth/accounts/native.mjs';
import { clearSessionCookie } from '../../../platform/auth/cookie';
import { mutationGuard } from '../../../app/operations';
import { TENANT, type SessionStore, type SlateRole } from './store';

/**
 * Base's native accounts contract over Slate's members, sessions and identity
 * bindings. Member IDs, roles, groups, guests and the slate_session cookie stay
 * native. Every read and mutation is scoped to the installation's workspace.
 */
export function createNativeAccounts(store: SessionStore, input: { clock: () => number; providerFingerprint: string | null }): NativeAccountsAdapter<SlateRole> {
  const { db } = store;
  const refuse = async (): Promise<never> => { throw new Error('Slate binds and issues provider sessions atomically.'); };
  return {
    findById: id => store.member('id=?', id),
    findByEmail: email => store.member('lower(email)=lower(?)', email),
    async findBinding({ issuer, subject }) {
      return store.member('id=(SELECT member_id FROM member_identity_bindings WHERE issuer=? AND subject=?)', issuer, subject);
    },
    bind: refuse,
    issueSession: refuse,
    getSession: (request, { now }) => store.read(request, now),
    async signOut(request, { now }) {
      await store.revokeToken(request, now);
      return { cookie: clearSessionCookie() };
    },
    async revokeSession(id) {
      const now = new Date(input.clock()).toISOString();
      await db.prepare(`UPDATE sessions SET revoked_at=COALESCE(revoked_at,?),updated_at=? WHERE id=? AND member_id IN (SELECT id FROM members WHERE workspace_id=${TENANT})`).bind(now, now, id).run();
    },
    owner: () => store.member("role='owner' AND status='active' ORDER BY is_setup_owner DESC, created_at, id"),
    async identityEnabled() { return store.identityEnabled; },
    /** A changed provider configuration advances the generation exactly once. */
    async policyVersion() {
      if (input.providerFingerprint !== null) await db.prepare('UPDATE auth_identity_policy SET generation=generation+1,fingerprint=? WHERE id=1 AND fingerprint IS NOT ?').bind(input.providerFingerprint, input.providerFingerprint).run();
      return (await db.prepare('SELECT generation FROM auth_identity_policy WHERE id=1').first<{ generation: number }>())!.generation;
    },
    // Slate has no domain rules: every member may use email or the configured provider.
    async requiredProvider() { return null; },
    async currentBoundSubject({ personId, issuer }) {
      const rows = (await db.prepare('SELECT subject FROM member_identity_bindings WHERE issuer=? AND member_id=?').bind(issuer, personId).all<{ subject: string }>()).results;
      return rows.length === 1 ? rows[0]!.subject : null;
    },
    async bindAndIssueSession({ person, principal, returnTo }) {
      if (!store.identityEnabled || !Number.isSafeInteger(principal.providerGeneration) || principal.providerGeneration < 0) return null;
      const now = input.clock(), pin = principal.providerPin;
      // One transaction: current person, policy generation and pin; never move
      // an existing binding to another member. Slate has no passwords to revoke.
      return store.issue({ person: person as Parameters<SessionStore['issue']>[0]['person'], kind: 'oidc', now, returnTo, principal, statements: [
        mutationGuard(db, 'SELECT generation=? FROM auth_identity_policy WHERE id=1', [principal.providerGeneration]),
        // Protocol sign-ins carry the provider pin; Base's server-verified seams carry none.
        ...(pin ? [mutationGuard(db, "SELECT EXISTS(SELECT 1 FROM oa_identity_providers WHERE provider_id=? AND status='linked' AND issuer=? AND client_id=? AND linked_at=?)", [pin.id, pin.issuer, pin.clientId, pin.linkedAt])] : []),
        db.prepare('INSERT INTO member_identity_bindings (issuer,subject,member_id,created_at) VALUES (?,?,?,?) ON CONFLICT(issuer,subject) DO NOTHING').bind(principal.issuer, principal.subject, person.id, new Date(now).toISOString()),
        mutationGuard(db, 'SELECT member_id=? FROM member_identity_bindings WHERE issuer=? AND subject=?', [person.id, principal.issuer, principal.subject]),
      ] });
    },
  };
}
