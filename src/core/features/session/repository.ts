import { and, eq, gt, isNull } from "drizzle-orm";
import { createDatabase } from "../../platform/db/client";
import { knowledgeMembers, knowledgeSessions, knowledgeWorkspaces } from "../../platform/db/knowledge-schema";
import type { AuthenticatedMember } from "../../app/types";

export interface SessionRecord {
  id: string;
  memberId: string;
  tokenDigest: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

const memberColumns = {
  id: knowledgeMembers.id,
  workspaceId: knowledgeMembers.workspaceId,
  workspaceName: knowledgeWorkspaces.name,
  email: knowledgeMembers.email,
  displayName: knowledgeMembers.displayName,
  initials: knowledgeMembers.initials,
  role: knowledgeMembers.role,
};

function asMember(row: Record<string, unknown> | undefined): AuthenticatedMember | null {
  return (row as AuthenticatedMember | undefined) ?? null;
}

export function createSessionRepository(binding: D1Database) {
  const db = createDatabase(binding);

  return {
    async getMember(memberId: string): Promise<AuthenticatedMember | null> {
      const [row] = await db
        .select(memberColumns)
        .from(knowledgeMembers)
        .innerJoin(knowledgeWorkspaces, eq(knowledgeMembers.workspaceId, knowledgeWorkspaces.id))
        .where(and(eq(knowledgeMembers.id, memberId), eq(knowledgeMembers.status, "active")))
        .limit(1);
      return asMember(row);
    },

    async create(input: SessionRecord) {
      await db.insert(knowledgeSessions).values(input);
    },

    async findAuthenticatedMember(tokenDigest: string, now: string): Promise<AuthenticatedMember | null> {
      const [row] = await db
        .select(memberColumns)
        .from(knowledgeSessions)
        .innerJoin(knowledgeMembers, eq(knowledgeSessions.memberId, knowledgeMembers.id))
        .innerJoin(knowledgeWorkspaces, eq(knowledgeMembers.workspaceId, knowledgeWorkspaces.id))
        .where(and(
          eq(knowledgeSessions.tokenDigest, tokenDigest),
          gt(knowledgeSessions.expiresAt, now),
          isNull(knowledgeSessions.revokedAt),
          eq(knowledgeMembers.status, "active"),
        ))
        .limit(1);
      return asMember(row);
    },

    async revokeByDigest(tokenDigest: string, revokedAt: string) {
      await db
        .update(knowledgeSessions)
        .set({ revokedAt, updatedAt: revokedAt })
        .where(and(eq(knowledgeSessions.tokenDigest, tokenDigest), isNull(knowledgeSessions.revokedAt)));
    },
  };
}
