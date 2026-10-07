import { createWorkspaceRepository } from "./repository";
import { sampleMembers, sampleWorkspace } from "./sample-data";

export function createWorkspaceService(binding: D1Database) {
  const repository = createWorkspaceRepository(binding);

  return {
    seedLocalSampleData() {
      return repository.seedSampleDataIfEmpty({ workspace: sampleWorkspace, members: sampleMembers });
    },
  };
}
