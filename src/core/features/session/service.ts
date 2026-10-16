import { devAdmitted } from "../../../../modules/operator-auth/dev-admission.mjs";
import type { AuthenticatedMember } from "../../app/types";
import type { RuntimeConfig } from "../../platform/config/runtime";
import { sessionStore, type SlateSession } from "./native/store";

export interface SessionOptions { sessionSecret: string; identityEnabled: boolean }
export const sessionOptions = (config: RuntimeConfig): SessionOptions => ({ sessionSecret: config.sessionSecret, identityEnabled: !!config.identityProvider });

/**
 * Resolves the signed-in member through the same native session check Base's
 * composed service uses: current status and authority version, revocation,
 * expiry, the provider's 24-hour cap, generation, pin and binding, and the local
 * key gate for dev sessions. Sessions from before Base adoption stay valid.
 */
export function createSessionService(binding: D1Database, options: SessionOptions) {
  const store = sessionStore(binding, { secret: options.sessionSecret, secure: false, identityEnabled: options.identityEnabled, devAdmitted });
  async function current(request: Request): Promise<{ member: AuthenticatedMember; session: SlateSession } | null> {
    const session = await store.read(request, Date.now());
    if (!session) return null;
    return { member: session.member, session };
  }
  return {
    current,
    async authenticate(source: Headers | Request): Promise<AuthenticatedMember | null> {
      const request = source instanceof Request ? source : new Request("https://slate.invalid/", { headers: source });
      return (await current(request))?.member ?? null;
    },
  };
}
