import { createDatabase } from "../../platform/db/client";
import { knowledgeMembers, knowledgeWorkspaces } from "../../platform/db/knowledge-schema";
import type { sampleMembers, sampleWorkspace } from "./sample-data";

type SampleWorkspace = typeof sampleWorkspace;
type SampleMember = (typeof sampleMembers)[number];

export function createWorkspaceRepository(binding: D1Database) {
  const db = createDatabase(binding);

  return {
    /**
     * Creates the sample workspace only in an empty local database, or reports
     * that the single existing workspace is already the sample one. A custom
     * local workspace is never written to.
     */
    async seedSampleDataIfEmpty(input: { workspace: SampleWorkspace; members: SampleMember[] }) {
      const existing = await db.select({ id: knowledgeWorkspaces.id }).from(knowledgeWorkspaces);
      if (existing.length === 1 && existing[0].id === input.workspace.id) return true;
      if (existing.length > 0) return false;

      await db.batch([
        db.insert(knowledgeWorkspaces).values(input.workspace).onConflictDoNothing(),
        db.insert(knowledgeMembers).values(input.members).onConflictDoNothing(),
      ]);
      return true;
    },
  };
}
