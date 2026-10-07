import type { ReactNode } from "react";
import { useWorkspace } from "./WorkspaceContext";
import { FirstRunShell } from "./FirstRunShell";
import { RequestState } from "./RequestState";
export function WorkspaceGate({ children }: { children: ReactNode }) {
  const { workspace, setup } = useWorkspace();
  return (
    <RequestState
      loading={workspace.loading || setup.loading}
      error={workspace.error || setup.error}
      retry={() => {
        workspace.reload();
        setup.reload();
      }}
    >
      {workspace.data && setup.data ? (
        setup.data.required && setup.data.canComplete ? (
          <FirstRunShell />
        ) : (
          children
        )
      ) : null}
    </RequestState>
  );
}
