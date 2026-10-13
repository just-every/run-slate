import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { TemplatesWorkspace } from "../core/features/templates/ui/workspace/TemplatesWorkspace";
export const Route = createFileRoute("/app/templates/")({
  component: editorLeaf(TemplatesWorkspace),
});
