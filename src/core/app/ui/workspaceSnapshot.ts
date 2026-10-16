import type { AuthenticatedMember } from "../types";
import type { WorkspaceView } from "../../shared/api/workspace";
import type { LaunchProfile } from "../../platform/config/launch-profile";
import type { navigation } from "../../features/navigation/service";

/** Only authorized, serializable presentation data crosses the Start boundary. */
export interface WorkspaceSnapshot {
  resourcePath?:string;
  localDevelopment?: boolean;
  editorEnabled?: boolean;
  resources?: import("../../client/InitialResources").InitialResources;
  member: AuthenticatedMember;
  workspace: WorkspaceView;
  setup: { required: boolean; canComplete: boolean };
  navigation: Awaited<ReturnType<typeof navigation>>;
  profile: { profile: LaunchProfile };
}
