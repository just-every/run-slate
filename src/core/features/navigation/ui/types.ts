import type { ContainerVisibility, PageLifecycle } from "../../../shared/knowledge/model";

/** WORK-012: light, dark and follow-the-system. */
export type ThemeChoice = "light" | "dark" | "system";

/** The global destinations that sit above the sections in every sidebar (NAV-004). */
export type NavDestinationId = "home" | "search" | "chat" | "inbox";

/** The rows at the foot of the sidebar. `trash` is the entry ARCH-005 requires. */
export type NavFooterId = "library" | "trash" | "help";

export type NavSectionKey = "recents" | "favourites" | "shared" | "personal" | "containers";

export type NavNodeKind = "page" | "database" | "container";

/** One row in a sidebar tree. Every field is supplied by the caller. */
export interface NavNode {
  id: string;
  title: string;
  /** Stored icon, an emoji string, or null when the entry has none. */
  icon: string | null;
  kind: NavNodeKind;
  /** Only pages carry a lifecycle; the draft chip needs it (LIFE-001). */
  lifecycle?: PageLifecycle;
  /** TREE-003: a shared entry names the container it sits in. */
  containerName?: string | null;
  /** True when the row can disclose children, even before they are loaded. */
  hasChildren?: boolean;
  children?: readonly NavNode[];
}

/** An entry on home (NAV-001) and in the recents list (NAV-002). */
export interface NavEntry {
  id: string;
  title: string;
  icon: string | null;
  kind: NavNodeKind;
  /** The container the entry lives in, when it has one. */
  containerName?: string | null;
  /** Written-out time, e.g. "Opened 9:40 in the morning". Never computed here. */
  metaLabel?: string | null;
}

/** A recents entry carries the day heading it belongs under (NAV-002). */
export interface RecentEntry extends NavEntry {
  dayLabel: string;
}

/** A row of the container index. */
export interface ContainerIndexEntry {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  visibility: ContainerVisibility;
  memberCount: number;
  grantCount: number;
  isPersonal: boolean;
  isMember: boolean;
}

export interface ContainerIndexFilterState {
  membership: "all" | "mine";
  visibility: ContainerVisibility | "any";
  includePersonal: boolean;
}

export interface WorkspaceSummary {
  name: string;
  /** A stored emoji or short mark, or null for the initial of the name. */
  mark: string | null;
}

/** A container as home lists it (NAV-001). */
export interface HomeContainerEntry {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}
