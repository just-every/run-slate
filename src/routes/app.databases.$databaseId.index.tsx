import { createFileRoute } from "@tanstack/react-router";
import { DatabaseWorkspace } from "../core/features/databases/ui/workspace/DatabaseWorkspace";
export const Route = createFileRoute("/app/databases/$databaseId/")({
  component: Page,
});
function Page() {
  const { databaseId } = Route.useParams();
  return <DatabaseWorkspace id={databaseId} />;
}
