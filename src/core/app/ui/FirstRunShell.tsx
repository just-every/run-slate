import {useEditorLeafReady} from "../../../editor/react";
import {useLocation} from "@tanstack/react-router";
import { FirstRunPage } from "../../features/session/ui/FirstRunPage";
import { useWorkspace } from "./WorkspaceContext";

/** Setup keeps its own gate: no content actions are mounted until it completes. The page names the signed-in owner by address, not the workspace, which has no name until step 1. */
export function FirstRunShell() {
  useEditorLeafReady(useLocation().pathname);
  const { member } = useWorkspace();
  return <section aria-label="Set up your workspace" data-testid="workspace-empty-state">
    <FirstRunPage owner={member.email} />
  </section>;
}
