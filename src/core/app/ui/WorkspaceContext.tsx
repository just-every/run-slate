import { createContext, useContext, type ReactNode } from "react";
import type { AuthenticatedMember } from "../types";
import type { WorkspaceView } from "../../shared/api/workspace";
import type { Resource } from "../../client/useResource";
import type { WorkspaceSnapshot } from "./workspaceSnapshot";
import { useShellResource } from "./useShellResource";

const WorkspaceContext = createContext<{
  localDevelopment: boolean;
  business: { name: string } | null;
  member: AuthenticatedMember;
  workspace: Resource<WorkspaceView>;
  setup: Resource<WorkspaceSnapshot["setup"]>;
  navigation: Resource<WorkspaceSnapshot["navigation"]>;
} | null>(null);
export function WorkspaceProvider({
  snapshot,
  children,
}: {
  snapshot: WorkspaceSnapshot;
  children: ReactNode;
}) {
  const { member } = snapshot;
  const workspace = useShellResource("/api/workspace", snapshot.workspace);
  const setup = useShellResource("/api/workspace/first-run", snapshot.setup);
  const navigation = useShellResource("/api/navigation", snapshot.navigation);
  return (
    <WorkspaceContext.Provider value={{ member, workspace, setup, navigation, business: snapshot.business ?? null, localDevelopment: snapshot.localDevelopment === true }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Workspace context is missing.");
  return context;
}
