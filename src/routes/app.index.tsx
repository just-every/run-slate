import { createFileRoute } from "@tanstack/react-router";
import { TodayWorkspace } from "../core/features/navigation/ui/workspace/TodayWorkspace";
export const Route = createFileRoute("/app/")({ component: TodayWorkspace });
