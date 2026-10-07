import { createFileRoute } from "@tanstack/react-router";
import { SettingsWorkspace } from "../core/features/settings/ui/workspace/SettingsWorkspace";
export const Route = createFileRoute("/app/settings")({
  component: SettingsWorkspace,
});
