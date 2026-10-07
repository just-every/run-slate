import { createFileRoute } from "@tanstack/react-router";
import { PageWorkspace } from "../core/features/pages/ui/workspace/PageWorkspace";
export const Route = createFileRoute("/app/pages/$pageId")({
  component: PageRoute,
});
function PageRoute() {
  return <PageWorkspace pageId={Route.useParams().pageId} />;
}
