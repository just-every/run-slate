import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceInbox } from "../core/features/notifications/ui/WorkspaceInbox";
export const Route = createFileRoute("/app/inbox")({
  component: WorkspaceInbox,
});
