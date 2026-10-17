import { reportUnmapped } from "../report";
import type { ImportReport, ImportedGrant, ImportedMember } from "../types";
import { tableRows, type ConfluenceTables } from "./tables";

/**
 * Confluence content restrictions become Slate grants.
 *
 * `SHARE-004` allows at most one grant per page whose principal is the container
 * or the workspace, and allows none at all on a page in a personal container.
 * `SHARE-005` says an imported general grant is container-scoped, never widened
 * to the workspace. So a restriction naming a user or a group becomes a named
 * grant on that principal, and only a restriction naming everyone — Confluence's
 * `ACCESS_CLASS` principals — can become the single general grant, and only when
 * the space is not personal.
 *
 * An unknown permission type produces no grant: inventing a level would be a
 * semantic fallback, so it is named in the report instead.
 */

const levels: Record<string, ImportedGrant["level"]> = { EDIT: "edit", VIEW: "view", COMMENT: "comment", FULL: "full" };
const levelRank: Record<ImportedGrant["level"], number> = { view: 1, comment: 2, edit: 3, full: 4 };

export interface ConfluenceGrants {
  byContent: Map<string, ImportedGrant[]>;
  members: ImportedMember[];
}

export function memberSourceId(principal: string): string {
  return `confluence-member:${principal}`;
}

/**
 * `PORT-005`: every principal the export names arrives as an inactive
 * historical actor. An import never activates an account.
 */
export function confluenceMembers(tables: ConfluenceTables): ImportedMember[] {
  return tableRows(tables, "user_mapping").map((row) => ({
    sourceId: memberSourceId(row.user_key ?? row.aaid ?? ""),
    sourceIdentityKind: "native" as const,
    displayName: row.username || row.user_key || row.aaid || "Unknown member",
    status: "inactive-historical" as const,
  })).filter((member) => member.sourceId !== memberSourceId(""));
}

export function confluenceGrants(
  tables: ConfluenceTables,
  containerFor: (contentId: string) => string,
  isPersonalContainer: (containerSourceId: string) => boolean,
  report: ImportReport,
): Map<string, ImportedGrant[]> {
  const byContent = new Map<string, ImportedGrant[]>();
  const general = new Map<string, ImportedGrant>();

  for (const permission of tableRows(tables, "content_permissions")) {
    const contentId = permission.content_id ?? "";
    if (!contentId) continue;
    const sourceId = `confluence-content:${contentId}`;
    const level = levels[(permission.permission_type ?? "").toUpperCase()];
    if (!level) {
      reportUnmapped(report, `Confluence restriction type "${permission.permission_type}" has no Slate grant level, so no grant was created`, sourceId);
      continue;
    }
    const container = containerFor(contentId);
    const principalType = (permission.principal_type ?? "").toUpperCase();
    const principalId = permission.principal_id ?? "";
    const groupName = permission.groupname ?? "";

    if (principalType === "USER" && principalId) {
      byContent.set(contentId, [...(byContent.get(contentId) ?? []), { principalKind: "member", principalSourceId: memberSourceId(principalId), level, general: false }]);
      continue;
    }
    if (principalType === "GROUP" || groupName) {
      const name = groupName || principalId;
      if (!name) { reportUnmapped(report, "Confluence group restriction names no group", sourceId); continue; }
      byContent.set(contentId, [...(byContent.get(contentId) ?? []), { principalKind: "group", principalSourceId: `confluence-group:${name}`, level, general: false }]);
      continue;
    }
    if (principalType !== "ACCESS_CLASS") {
      reportUnmapped(report, `Confluence restriction principal type "${principalType}" has no Slate principal, so no grant was created`, sourceId, principalId || undefined);
      continue;
    }
    // Everyone-with-access: the only restriction that can become the one
    // general grant, and never on a personal container (`SHARE-004`).
    if (isPersonalContainer(container)) {
      reportUnmapped(report, "Confluence space-wide restriction on a personal space carries no general grant", sourceId, principalId || undefined);
      continue;
    }
    const existing = general.get(contentId);
    if (existing) {
      reportUnmapped(report, "Confluence content carries more than one space-wide restriction; the strongest became its single general grant", sourceId, `${existing.level} vs ${level}`);
      if (levelRank[level] <= levelRank[existing.level]) continue;
    }
    general.set(contentId, { principalKind: "container", principalSourceId: container, level, general: true });
  }

  for (const [contentId, grant] of general) {
    byContent.set(contentId, [...(byContent.get(contentId) ?? []), grant]);
  }
  return byContent;
}
