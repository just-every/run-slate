import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { DatabaseWorkspace } from "../core/features/databases/ui/workspace/DatabaseWorkspace";
export const Route = createFileRoute("/app/databases/$databaseId/")({
  component: editorLeaf(Page),
});
function Page() {
  const { databaseId } = Route.useParams();
  return <DatabaseWorkspace id={databaseId} />;
}
