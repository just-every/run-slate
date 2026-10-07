import type { AuthenticatedMember } from "../../app/types";
import { clearSessionCookie, createSessionCookie, readCookie, SESSION_COOKIE_NAME } from "../../platform/auth/cookie";
import { createOpaqueToken, sessionDigest } from "../../platform/auth/token";
import { createUlid } from "../../shared/ulid";
import { SAMPLE_OWNER_MEMBER_ID } from "../workspace/sample-data";
import { createSessionRepository } from "./repository";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/**
 * `sessionSecret` comes from the checked runtime configuration and keys every
 * stored digest, so a session cannot be created or resolved on a deployment
 * that has not supplied it.
 */
export function createSessionService(binding: D1Database, sessionSecret: string) {
  const repository = createSessionRepository(binding);
  const digest = (token: string) => sessionDigest(sessionSecret, token);

  return {
    capabilities(localSampleData: boolean) {
      return { localSession: localSampleData, mailDelivery: false };
    },

    async createLocalSession(localSampleData: boolean) {
      if (!localSampleData) return null;

      const member = await repository.getMember(SAMPLE_OWNER_MEMBER_ID);
      if (!member) throw new Error("The local sample member is unavailable. Apply migrations before signing in.");

      const token = createOpaqueToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + THIRTY_DAYS).toISOString();
      await repository.create({
        id: createUlid(),
        memberId: member.id,
        tokenDigest: await digest(token),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt,
      });

      return { token, expiresAt, member };
    },

    async authenticate(headers: Headers): Promise<AuthenticatedMember | null> {
      const token = readCookie(headers, SESSION_COOKIE_NAME);
      if (!token) return null;
      return repository.findAuthenticatedMember(await digest(token), new Date().toISOString());
    },

    async logout(headers: Headers): Promise<string> {
      const token = readCookie(headers, SESSION_COOKIE_NAME);
      if (token) await repository.revokeByDigest(await digest(token), new Date().toISOString());
      return clearSessionCookie();
    },

    cookieFor(token: string, expiresAt: string, secure: boolean): string {
      return createSessionCookie(token, expiresAt, secure);
    },
  };
}
