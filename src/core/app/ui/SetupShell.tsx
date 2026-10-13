import { Navigate } from "@tanstack/react-router";
import type { WorkspaceSnapshot } from "./workspaceSnapshot";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";
import { WorkspaceGate } from "./WorkspaceGate";
import { LaunchProfileProvider } from "./LaunchProfile";
import { EditorMount } from "./EditorMount";
import { FirstRunShell } from "./FirstRunShell";

export function SetupShell({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  return <LaunchProfileProvider initial={snapshot.profile}><WorkspaceProvider snapshot={snapshot}>
    {snapshot.editorEnabled && snapshot.member.role === "owner" ? <EditorMount ownerId={snapshot.member.id} /> : null}
    <WorkspaceGate><SetupContent /></WorkspaceGate>
  </WorkspaceProvider></LaunchProfileProvider>;
}

function SetupContent() {
  const { setup } = useWorkspace();
  return setup.data?.required && setup.data.canComplete
    ? <FirstRunShell />
    : <Navigate to="/app" replace />;
}
