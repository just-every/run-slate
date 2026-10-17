import type { RuntimeBindings, RuntimeConfig } from "../platform/config/runtime";

export type AppBindings = RuntimeBindings & Omit<SlateWorkerBindings, keyof RuntimeBindings | "CONTENT_COLLABORATION"> & {
  CONTENT_COLLABORATION?: SlateWorkerBindings["CONTENT_COLLABORATION"];
  /** Base deploy-kit's deployment identity, which `/health` reports back. */
  RER_DEPLOY_SOURCE?: string;
  RER_DEPLOY_FINGERPRINT?: string;
  RER_VERSION?: WorkerVersionMetadata;
  /** "true" only on a Managed preview Worker; enables the owner's preview entry (preview-owner-signin.ts). */
  RER_PREVIEW?: string;
  /** The preview secret earlier RER releases bind instead of RER_PREVIEW; read the same way. */
  RER_PREVIEW_TOKEN?: string;
};

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
  /** The native session that authenticated `member`; absent for agent credentials. */
  sessionId?: string;
  /** Set by a route that passed Base step-up; its commit repeats the proof check. */
  stepUp?: { sessionId: string; since: number };
  runtimeConfig: RuntimeConfig;
}

export interface AppEnvironment {
  Bindings: AppBindings;
  Variables: AppVariables;
}
