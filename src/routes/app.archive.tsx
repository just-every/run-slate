import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceArchive } from "../core/features/archive/ui/WorkspaceArchive";
export const Route = createFileRoute("/app/archive")({
  component: WorkspaceArchive,
});
