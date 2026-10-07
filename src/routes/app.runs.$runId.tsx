import { createFileRoute } from "@tanstack/react-router";
import { RunWorkspace } from "../core/features/runs/ui/RunWorkspace";
export const Route = createFileRoute("/app/runs/$runId")({ component: Page });
function Page() {
  const { runId } = Route.useParams();
  return <RunWorkspace id={runId} />;
}
