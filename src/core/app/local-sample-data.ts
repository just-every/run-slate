import { createWorkspaceService } from "../features/workspace";

/**
 * Only the explicit local Vite/Miniflare binding reaches this, and only after a
 * loopback sign-in request. It creates records in an empty local D1 or reports
 * that the one existing workspace is already the sample; it never touches a
 * custom workspace and never reaches deployment configuration.
 */
export function seedLocalAuroraSampleData(binding: D1Database): Promise<boolean> {
  return createWorkspaceService(binding).seedLocalSampleData();
}
