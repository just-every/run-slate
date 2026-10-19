import type { FeatureContext } from "../../app/feature-context";
import type { BlockInput } from "../pages/types";
import type { TemplateSnapshot } from "./snapshots";
/**
 * TMPL-007: the starter templates Slate ships. Each is a workspace-wide shipped template (TMPL-004): it can be
 * duplicated into an editable copy and is never edited or erased. Changing this set changes STARTER_REVISION, and the
 * next template read in each workspace brings its shipped copies up to date.
 */
export const STARTER_REVISION = "starter-2026-10-19";
type Span = { text: string; marks?: string[]; status?: { colour: string } };
let order = 0;
const block = (key: string, blockType: string, content: unknown): BlockInput => ({ id: key, blockType, content: content as BlockInput["content"], treePosition: String(++order).padStart(4, "0") });
const h = (key: string, text: string, level = 2) => block(key, "heading", { level, text: [{ text }] });
const p = (key: string, ...text: (string | Span)[]) => block(key, "paragraph", { text: text.map((t) => (typeof t === "string" ? { text: t } : t)) });
const list = (key: string, variant: "bulleted" | "numbered", items: string[]) => block(key, "list", { variant, items: items.map((text, i) => ({ id: `${key}-${i + 1}`, text: [{ text }] })) });
const task = (key: string, text: string) => block(key, "task", { text: [{ text }], done: false, assigneeMemberId: null, dueDate: null });
const callout = (key: string, text: string, tone = "neutral") => block(key, "callout", { text: [{ text }], tone });
const table = (key: string, columns: string[], rows: string[][]) => block(key, "table", { columns, rows: rows.map((cells, i) => ({ id: `${key}-${i + 1}`, cells })) });
const status = (text: string, colour = "grey"): Span => ({ text, status: { colour } });
function page(title: string, icon: string, blocks: BlockInput[]): TemplateSnapshot {
  order = 0;
  return { title, properties: { icon, coverFileId: null, labels: [], typeface: "default", smallText: false, fullWidth: false }, blocks: blocks.map((b, i) => ({ ...b, treePosition: String(i + 1).padStart(4, "0") })), children: [], assets: [], fieldDefinitions: [], fileFieldIds: [], relationFieldIds: [] };
}
export interface Starter { key: string; title: string; description: string; category: string; snapshot: TemplateSnapshot }
export const starters: Starter[] = [
  { key: "meeting-notes", title: "Meeting notes", category: "Meetings", description: "Attendees, agenda, notes and action items with owners and due dates.", snapshot: page("Meeting notes", "🗓️", [
    h("attendees", "Attendees"), p("attendees-body", "Mention everyone who joined, for example @name."),
    h("agenda", "Agenda"), list("agenda-items", "numbered", ["Review last meeting's action items", "Topic one", "Topic two"]),
    h("notes", "Notes"), p("notes-body", "Key points and decisions."),
    h("actions", "Action items"), task("action-1", "Action item: assign an owner and a due date"), task("action-2", "Action item: assign an owner and a due date"),
  ]) },
  { key: "retrospective", title: "Retrospective", category: "Meetings", description: "What went well, what to improve, and the actions the team commits to.", snapshot: page("Retrospective", "🔁", [
    p("period", "Period: ", status("Sprint or project")),
    h("well", "What went well"), list("well-items", "bulleted", [""]),
    h("improve", "What could be better"), list("improve-items", "bulleted", [""]),
    h("actions", "Actions"), task("action-1", "Improvement: assign an owner"),
  ]) },
  { key: "decision", title: "Decision", category: "Decisions", description: "The question, the options weighed, the decision and its consequences.", snapshot: page("Decision", "⚖️", [
    p("status", "Status: ", status("Proposed", "yellow")),
    h("context", "Context"), p("context-body", "What needs deciding, and why now."),
    h("options", "Options considered"), table("options-table", ["Option", "Pros", "Cons"], [["Option A", "", ""], ["Option B", "", ""]]),
    h("decision", "Decision"), p("decision-body", "What was decided, by whom, and when."),
    h("consequences", "Consequences"), list("consequences-items", "bulleted", ["What changes as a result"]),
  ]) },
  { key: "how-to", title: "How-to guide", category: "Documentation", description: "Step-by-step instructions for one task.", snapshot: page("How-to guide", "🧭", [
    p("intro", "Use this guide to accomplish one task."),
    callout("before", "Before you start: list what the reader needs.", "accent"),
    h("steps", "Steps"), list("steps-items", "numbered", ["First step", "Second step", "Third step"]),
    h("result", "Result"), p("result-body", "What the reader should see when they are done."),
  ]) },
  { key: "troubleshooting", title: "Troubleshooting article", category: "Documentation", description: "Symptoms, causes and fixes for a known problem.", snapshot: page("Troubleshooting article", "🛠️", [
    h("symptoms", "Symptoms"), p("symptoms-body", "What the person sees, including exact error messages."),
    h("causes", "Causes and fixes"), table("fixes", ["Cause", "How to check", "Fix"], [["", "", ""], ["", "", ""]]),
    callout("escalate", "Still stuck? Say who to contact and what to include.", "warn"),
  ]) },
  { key: "product-requirements", title: "Product requirements", category: "Planning", description: "Goals, requirements, linked issues and a live report of the open tasks.", snapshot: page("Product requirements", "📋", [
    table("summary", ["Field", "Value"], [["Owner", ""], ["Target release", ""], ["Status", "Draft"]]),
    h("goals", "Goals"), list("goals-items", "bulleted", ["Goal"]),
    h("requirements", "Requirements"), table("requirements-table", ["Requirement", "Importance", "Notes"], [["", "Must have", ""], ["", "Should have", ""]]),
    h("issues", "Issues"), callout("issues-help", "Paste each issue link on its own line here: it becomes an embedded issue card.", "accent"),
    h("tasks", "Open tasks"), task("task-1", "Task: assign an owner and a due date"), block("task-report", "task-report", { definition: { state: "open", groupBy: "assignee", orderBy: "due", direction: "asc", limit: 20 } }),
    h("questions", "Open questions"), list("questions-items", "bulleted", ["Question"]),
  ]) },
  { key: "project-plan", title: "Project plan", category: "Planning", description: "Scope, milestones, owners and risks for a project.", snapshot: page("Project plan", "🗺️", [
    h("overview", "Overview"), p("overview-body", "What the project delivers and why."),
    h("milestones", "Milestones"), table("milestones-table", ["Milestone", "Owner", "Due", "Status"], [["", "", "", "Not started"], ["", "", "", "Not started"]]),
    h("tasks", "Tasks"), task("task-1", "Task: assign an owner and a due date"),
    h("risks", "Risks"), table("risks-table", ["Risk", "Likelihood", "Mitigation"], [["", "", ""]]),
  ]) },
  { key: "runbook", title: "Runbook", category: "Operations", description: "When to use it, the procedure, how to verify it and how to roll back.", snapshot: page("Runbook", "📟", [
    callout("when", "When to use this runbook: describe the alert or situation.", "warn"),
    h("prerequisites", "Prerequisites"), list("prerequisites-items", "bulleted", ["Access needed", "Tools needed"]),
    h("procedure", "Procedure"), list("procedure-items", "numbered", ["Step", "Step", "Step"]),
    h("verify", "Verify"), p("verify-body", "How to confirm the procedure worked."),
    h("rollback", "Roll back"), list("rollback-items", "numbered", ["Step"]),
    h("contacts", "Escalation"), p("contacts-body", "Who to contact if this fails."),
  ]) },
  { key: "onboarding", title: "Onboarding page", category: "Teams", description: "A newcomer's first week: people, reading, access and tasks.", snapshot: page("Onboarding page", "👋", [
    p("welcome", "Welcome to the team! This page gets you started."),
    h("people", "People to meet"), table("people-table", ["Person", "Role", "Why"], [["", "", ""], ["", "", ""]]),
    h("reading", "Read first"), list("reading-items", "bulleted", ["Link a page"]),
    h("week", "First week"), task("task-1", "Set up your accounts and access"), task("task-2", "Meet your onboarding buddy"),
  ]) },
  { key: "team-home", title: "Team home", category: "Teams", description: "Who the team is, what it works on and where to find things.", snapshot: page("Team home", "🏠", [
    callout("mission", "Our mission: one sentence about what this team does.", "accent"),
    h("people", "Who we are"), table("people-table", ["Person", "Role"], [["", ""], ["", ""]]),
    h("work", "What we're working on"), list("work-items", "bulleted", ["Current priority"]),
    h("links", "Key pages"), list("links-items", "bulleted", ["Link a page"]),
    h("contact", "How to reach us"), p("contact-body", "Channels, office hours and how to ask for help."),
  ]) },
  { key: "policy", title: "Policy page", category: "Policies", description: "A policy with its owner, review date, scope and rules.", snapshot: page("Policy page", "📜", [
    table("summary", ["Field", "Value"], [["Owner", "The page owner"], ["Review date", "Set the next review date"], ["Applies to", ""]]),
    callout("review", "The page owner keeps this policy current and verifies it by its review date.", "neutral"),
    h("purpose", "Purpose"), p("purpose-body", "Why this policy exists."),
    h("policy", "Policy"), list("policy-items", "numbered", ["Rule"]),
    h("exceptions", "Exceptions"), p("exceptions-body", "How to request an exception."),
  ]) },
];
const starterId = (workspaceId: string, key: string) => `starter-${key}-${workspaceId}`;
/** Idempotent: brings this workspace's shipped starters to STARTER_REVISION. Called before every template read. */
export async function ensureStarterTemplates(ctx: Pick<FeatureContext, "db" | "now" | "actor">) {
  const current = await ctx.db.prepare("SELECT COUNT(*) AS n FROM knowledge_templates WHERE workspace_id=? AND is_shipped=1 AND revision_id=?").bind(ctx.actor.workspaceId, STARTER_REVISION).first<{ n: number }>();
  if (current?.n === starters.length) return;
  await ctx.db.batch(starters.map((s) =>
    ctx.db.prepare("INSERT INTO knowledge_templates (id,workspace_id,container_id,title,description,category,snapshot_json,is_shipped,created_at,updated_at,revision_id) VALUES (?,?,NULL,?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,snapshot_json=excluded.snapshot_json,is_shipped=1,archived_at=NULL,deleted_at=NULL,updated_at=excluded.updated_at,revision_id=excluded.revision_id")
      .bind(starterId(ctx.actor.workspaceId, s.key), ctx.actor.workspaceId, s.title, s.description, s.category, JSON.stringify(s.snapshot), ctx.now, ctx.now, STARTER_REVISION),
  ));
}
