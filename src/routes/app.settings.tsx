import {editorLeaf} from "../editor-leaf";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SettingsWorkspace } from "../core/features/settings/ui/workspace/SettingsWorkspace";
export const Route = createFileRoute("/app/settings")({
  validateSearch: z.object({ section: z.string().optional() }),
  component: editorLeaf(SettingsWorkspace),
});
