import { and, eq } from "drizzle-orm";
import { createDatabase } from "../../platform/db/client";
import { knowledgeMembers, knowledgeWorkspaces } from "../../platform/db/knowledge-schema";
import type { AuthenticatedMember } from "../../app/types";

const memberColumns = {
  id: knowledgeMembers.id,
  workspaceId: knowledgeMembers.workspaceId,
  workspaceName: knowledgeWorkspaces.name,
  email: knowledgeMembers.email,
  displayName: knowledgeMembers.displayName,
  initials: knowledgeMembers.initials,
  role: knowledgeMembers.role,
};

export function createMemberRepository(binding: D1Database) {
  const db = createDatabase(binding);
  return {
    async getMember(memberId: string): Promise<AuthenticatedMember | null> {
      const [row] = await db
        .select(memberColumns)
        .from(knowledgeMembers)
        .innerJoin(knowledgeWorkspaces, eq(knowledgeMembers.workspaceId, knowledgeWorkspaces.id))
        .where(and(eq(knowledgeMembers.id, memberId), eq(knowledgeMembers.status, "active")))
        .limit(1);
      return (row as AuthenticatedMember | undefined) ?? null;
    },
  };
}
