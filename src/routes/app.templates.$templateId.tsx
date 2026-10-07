import { createFileRoute } from "@tanstack/react-router";
import { TemplatesWorkspace } from "../core/features/templates/ui/workspace/TemplatesWorkspace";
export const Route = createFileRoute("/app/templates/$templateId")({
  component: Page,
});
function Page() {
  const { templateId } = Route.useParams();
  return <TemplatesWorkspace templateId={templateId} />;
}
