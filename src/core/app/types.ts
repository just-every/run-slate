import type { RuntimeBindings, RuntimeConfig } from "../platform/config/runtime";

export interface AppBindings extends RuntimeBindings {
  DB: D1Database;
  FILES: R2Bucket;
  JOBS: Queue<unknown>;
  CONTENT_COLLABORATION?: DurableObjectNamespace;
}

/** The person the baseline calls an operator. `knowledge/vocabulary.ts` names them a member. */
export interface AuthenticatedMember {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  displayName: string;
  initials: string;
  role: "owner" | "member";
}

export interface AppVariables {
  member?: AuthenticatedMember;
  runtimeConfig: RuntimeConfig;
}

export interface AppEnvironment {
  Bindings: AppBindings;
  Variables: AppVariables;
}
