import { createFileRoute } from "@tanstack/react-router";
import { RecordWorkspace } from "../core/features/databases/ui/workspace/RecordWorkspace";
export const Route = createFileRoute(
  "/app/databases/$databaseId/records/$recordId",
)({ component: Page });
function Page() {
  const { databaseId, recordId } = Route.useParams();
  return <RecordWorkspace databaseId={databaseId} id={recordId} />;
}
