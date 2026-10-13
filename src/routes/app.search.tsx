import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceSearch } from "../core/features/search/ui/workspace/WorkspaceSearch";
export const Route = createFileRoute("/app/search")({
  component: editorLeaf(WorkspaceSearch),
});
