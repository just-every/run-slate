import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";

/**
 * Local domain types for the archive and trash surfaces (`ARCH-001` … `ARCH-006`).
 *
 * Design decision: times arrive already formatted for display. Every time field
 * on these types is named `…Label`, so no component is ever tempted to format a
 * date itself — formatting is the caller's job and stays out of the port.
 */

/** Capitalise a vocabulary noun so it can start a sentence. */
export function sentenceCase(noun: string): string {
  return noun.length === 0 ? noun : `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
}

export interface ArchivePerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** A page, a container or a database — the three things `ARCH-001` can archive. */
export type ArchivedKind = "page" | "container" | "database";

export const archivedKinds = ["page", "container", "database"] as const satisfies readonly ArchivedKind[];

/** The archived filter of `ARCH-002`, and the within-the-trash filter of `ARCH-005`. */
export type ArchiveKindFilter = "all" | ArchivedKind;

export const archiveKindFilters = ["all", ...archivedKinds] as const satisfies readonly ArchiveKindFilter[];

/** The container noun is never hard-coded in visible copy — it comes from the vocabulary. */
export function archivedKindLabel(kind: ArchivedKind): string {
  if (kind === "container") return sentenceCase(knowledgeNoun("container"));
  if (kind === "database") return "Database";
  return "Page";
}

export function archiveKindFilterLabel(filter: ArchiveKindFilter): string {
  return filter === "all" ? "All" : `${archivedKindLabel(filter)}s`;
}

export interface ArchiveLocation {
  id: string;
  label: string;
  /** the ancestor trail, outermost first */
  trail: readonly string[];
  /** `ARCH-003`: false when the prior parent is gone */
  stillExists: boolean;
}

/** The whole trail as one readable path, outermost first, ending at the prior parent. */
export function locationPath(location: ArchiveLocation): string {
  return [...location.trail, location.label].join(" / ");
}

export function destinationPath(destination: RestoreDestination): string {
  return [...destination.trail, destination.label].join(" / ");
}

export interface ArchivedEntry {
  id: string;
  kind: ArchivedKind;
  title: string;
  archivedBy: ArchivePerson;
  /** already formatted for display, e.g. "12 March 2026, 09:14" */
  archivedAtLabel: string;
  priorLocation: ArchiveLocation;
  reason: string | null;
  descendantCount: number;
}

export interface TrashedEntry {
  id: string;
  kind: ArchivedKind;
  title: string;
  deletedBy: ArchivePerson;
  /** already formatted for display, e.g. "12 March 2026, 09:14" */
  deletedAtLabel: string;
  priorLocation: ArchiveLocation;
  descendantCount: number;
}

/**
 * A record about to be archived (`ARCH-001`). It has no actor or time yet —
 * the dialog shows the actor and time that *will* be recorded.
 */
export interface ArchiveCandidate {
  id: string;
  kind: ArchivedKind;
  title: string;
  /** the location that will be recorded as the prior location */
  priorLocation: ArchiveLocation;
  descendantCount: number;
}

export interface RestoreDestination {
  id: string;
  label: string;
  trail: readonly string[];
}

/** `ARCH-001`: the dialog says exactly how many descendants go with the record. */
export function describeArchiveCascade(count: number): string {
  if (count === 0) return "Nothing sits beneath it, so nothing else is archived.";
  if (count === 1) return "1 page beneath it is archived too.";
  return `${count} pages beneath it are archived too.`;
}

/** `ARCH-002`: the same fact, stated on an archived row. */
export function describeArchivedDescendants(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 page archived with it" : `${count} pages archived with it`;
}

/** `ARCH-005`: deleting a page takes its descendants to the trash with it. */
export function describeTrashCascade(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 page went to the trash with it" : `${count} pages went to the trash with it`;
}
