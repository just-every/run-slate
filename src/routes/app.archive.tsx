import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceArchive } from "../core/features/archive/ui/WorkspaceArchive";
export const Route = createFileRoute("/app/archive")({
  component: editorLeaf(WorkspaceArchive),
});
