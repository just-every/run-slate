import {createPostsRoutes} from '../features/posts/routes';
import {createHomesRoutes} from '../features/homes/routes';
import {createWorkItemsRoutes} from '../features/work-items/routes';
import {createReminderRoutes} from '../features/reminders/routes';
import { createInstallationExportRoutes } from '../features/portability/installation-routes';
import { mountLaunchProfile } from "./launch-profile";
import {createClaimRoutes} from "../features/claims/routes";
import { createExternalAgentRoutes } from "../features/external-agent/routes";
import { createImpactRoutes } from "../features/impact/routes";
import { createSkillsRoutes } from "../features/skills/routes";
import { registerIntelligenceVisibility } from "../features/ai/integration";
import { createExperimentsRoutes } from "../features/experiments/routes";
import { createInquiriesRoutes } from "../features/inquiries/routes";
import { createEffectsRoutes } from "../features/effects/routes";
import { createDecisionsRoutes } from "../features/decisions/routes";
import { createRunsRoutes } from "../features/runs/routes";
import { createAiRoutes } from "../features/ai/routes";
import { createExportRoutes } from "../features/workspace-export/routes";
import { createImportRoutes } from "../features/imports/routes";
import { createSourceRoutes } from "../features/source-memory/routes";
import { createConnectorRoutes } from "../features/connectors/routes";
import { createSuggestionsRoutes } from "../features/suggestions/routes";
import { createCollaborationRoutes } from "../features/collaboration/routes";
import { createAnalyticsRoutes } from "../features/analytics/routes";
import { createActivityRoutes } from "../features/activity/routes";
import { createNotificationsRoutes } from "../features/notifications/routes";
import { createNavigationRoutes } from "../features/navigation/routes";
import { createSearchRoutes } from "../features/search/routes";
import { createPublicPagesRoutes } from "../features/publishing/routes";
import { createPublishingRoutes } from "../features/publishing/routes";
import { createMediaRoutes } from "../features/media/routes";
import { createArchiveRoutes } from "../features/archive/routes";
import { createStatusRoutes } from "../features/page-status/routes";
import { createCommentsRoutes } from "../features/comments/routes";
import { createAutomationRoutes } from "../features/automation/routes";
import { createTemplatesRoutes } from "../features/templates/routes";
import { createDatabasesRoutes } from "../features/databases/routes";
import { createWorkspaceRoutes } from "../features/workspace/routes";
import { createPagesRoutes } from "../features/pages/routes";
import { createContainersRoutes } from "../features/containers/routes";
import { createRevisionsRoutes } from "../features/versions/routes";
import { createSharingRoutes } from "../features/sharing/routes";
import type { Hono } from "hono";
import type { AppEnvironment } from "./types";

/**
 * The seam where a feature registers its Hono router under `/api/<feature>`.
 *
 * Worked example, once the pages feature exists:
 *
 *   import { createPageRoutes } from "../features/pages";
 *   app.route("/", createPageRoutes());
 *
 * Every route mounted here is behind the `/api/*` session guard in `hono.ts`
 * unless its exact path is added to that file's public list.
 */
export function mountFeatures(app: Hono<AppEnvironment>): Hono<AppEnvironment> {
  mountLaunchProfile(app);
  registerIntelligenceVisibility();
  app.route("/", createWorkspaceRoutes());
  app.route("/api/tasks",createWorkItemsRoutes());
  app.route("/api/reminders",createReminderRoutes());
  app.route("/api/pages", createPagesRoutes());
  app.route("/api/containers", createContainersRoutes());
  app.route("/api/revisions", createRevisionsRoutes());
  app.route("/api/sharing", createSharingRoutes());
  app.route("/api/databases", createDatabasesRoutes());
  app.route("/api/templates", createTemplatesRoutes());
  app.route("/api/posts",createPostsRoutes());
  app.route("/api/homes",createHomesRoutes());
  app.route("/api/automation", createAutomationRoutes());
  app.route("/api/comments", createCommentsRoutes());
  app.route("/api/status", createStatusRoutes());
  app.route("/api/archive", createArchiveRoutes());
  app.route("/api/media", createMediaRoutes());
  app.route("/api/publishing", createPublishingRoutes());
  app.route("/p", createPublicPagesRoutes());
  app.route("/api/search", createSearchRoutes());
  app.route("/api/navigation", createNavigationRoutes());
  app.route("/api/notifications", createNotificationsRoutes());
  app.route("/api/activity", createActivityRoutes());
  app.route("/api/analytics", createAnalyticsRoutes());
  app.route("/api/collaboration", createCollaborationRoutes());
  app.route("/api/suggestions", createSuggestionsRoutes());
  app.route("/api/connectors", createConnectorRoutes());
  app.route("/api/sources", createSourceRoutes());
  app.route("/api/imports", createImportRoutes());
  app.route("/api/exports", createExportRoutes());
  app.route("/api/portability", createInstallationExportRoutes());
  app.route("/api/ai", createAiRoutes());
  app.route("/api/runs", createRunsRoutes());
  app.route("/api/decisions", createDecisionsRoutes());
  app.route("/api/effects", createEffectsRoutes());
  app.route("/api/claims", createClaimRoutes());
  app.route("/api/inquiries", createInquiriesRoutes());
  app.route("/api/experiments", createExperimentsRoutes());
  app.route("/api/skills", createSkillsRoutes());
  app.route("/api/impact", createImpactRoutes());
  app.route("/api/agent", createExternalAgentRoutes());
  return app;
}
