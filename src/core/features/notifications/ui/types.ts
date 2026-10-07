import { containerNoun, recordNoun } from "./nouns";

/**
 * Local domain types for the inbox and its chat destination (`NOTIF-001` …
 * `NOTIF-003`).
 *
 * Design decision: times arrive already formatted — every time field is named
 * `…Label` — and a notification carries only what its reader may see. Nothing
 * here reconstructs a page from what it was told.
 */

/** `NOTIF-001` — everything that notifies a member in the app. */
export type NotificationKind =
  | "mention"
  | "comment"
  | "reply"
  | "page-published"
  | "page-republished"
  | "verification-lapsed"
  | "access-granted"
  | "ai-review"
  | "ai-failed";

export const notificationKinds = [
  "mention",
  "comment",
  "reply",
  "page-published",
  "page-republished",
  "verification-lapsed",
  "access-granted",
  "ai-review",
  "ai-failed",
] as const satisfies readonly NotificationKind[];

export interface NotificationKindCopy {
  /** The name of the kind, for the filter and for the chat destination's event list. */
  label: string;
  /** What happened, read straight after the actor's name. */
  event: string;
  /** The same fact where no member caused it — a lapse, a failed run. */
  systemEvent: string;
}

export const notificationKindCopy: Record<NotificationKind, NotificationKindCopy> = {
  mention: { label: "Mentions", event: "mentioned you in", systemEvent: "You were mentioned in" },
  comment: { label: "Comments", event: "commented on", systemEvent: "A comment was added on" },
  reply: { label: "Replies", event: "replied to a thread on", systemEvent: "A reply was added on" },
  "page-published": { label: "Published pages", event: "published", systemEvent: "A page you watch was published" },
  "page-republished": {
    label: "Republished pages",
    event: "republished",
    systemEvent: "A page you watch was republished",
  },
  "verification-lapsed": {
    label: "Lapsed verifications",
    event: "let a verification you own lapse on",
    systemEvent: "A verification you own has lapsed on",
  },
  "access-granted": {
    label: "Access granted",
    event: "gave you access to",
    systemEvent: "You were given access to",
  },
  "ai-review": {
    label: "AI runs needing review",
    event: "left an AI run needing your review on",
    systemEvent: "An AI run you started needs review on",
  },
  "ai-failed": {
    label: "Failed AI runs",
    event: "started an AI run that failed on",
    systemEvent: "An AI run you started failed on",
  },
};

/** `NOTIF-002` — the two views the inbox keeps apart. */
export type InboxView = "addressed" | "watched";

export const inboxViews = ["addressed", "watched"] as const satisfies readonly InboxView[];

export const inboxViewCopy: Record<InboxView, { label: string; description: string }> = {
  addressed: {
    label: "Addressed to you",
    description: "Mentions, replies, access and AI runs that name you. Your own actions never appear here.",
  },
  watched: {
    label: "Pages you watch",
    description: `Activity on the pages and ${containerNoun}s you follow, and on the ${recordNoun}s you authored.`,
  },
};

export type InboxKindFilter = "all" | NotificationKind;

export function inboxKindFilterLabel(filter: InboxKindFilter): string {
  return filter === "all" ? "Everything" : notificationKindCopy[filter].label;
}

export interface NotificationPerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** `NOTIF-001`, `NOTIF-002` — one entry in the inbox. */
export interface NotificationEntry {
  id: string;
  kind: NotificationKind;
  /** Absent where no member caused it: a lapse, a failed run. */
  actor: NotificationPerson | null;
  /** The page it happened on. */
  pageTitle: string;
  /** The trail above that page, outermost first. */
  pageTrail: readonly string[];
  /** The quoted snippet, where the event has one. */
  snippet: string | null;
  timeLabel: string;
  read: boolean;
  /** The thread this points at is resolved. */
  resolved: boolean;
  /** `NOTIF-002` — the comment to open the record at, where there is one. */
  commentId: string | null;
  recordId: string;
}

/** `NOTIF-002` — notifications grouped by period, newest period first. */
export interface NotificationPeriod {
  id: string;
  label: string;
  entries: readonly NotificationEntry[];
}

/** The inbox and the destination card render four states; neither has a denied one. */
export type NotificationSurfaceState = "ready" | "loading" | "empty" | "error";

/** `NOTIF-003` — the three states a chat destination can be in. */
export type ChatDestinationState = "connected" | "needs-attention" | "disconnected";

export const chatDestinationStateCopy: Record<
  ChatDestinationState,
  { label: string; tone: "good" | "warn" | "neutral"; statement: string }
> = {
  connected: { label: "Connected", tone: "good", statement: "Messages are being delivered." },
  "needs-attention": {
    label: "Needs attention",
    tone: "warn",
    statement:
      "The authorisation expired or was revoked, so nothing is being sent. The connection, its chosen events and its delivery history are all kept.",
  },
  disconnected: { label: "Disconnected", tone: "neutral", statement: "Nothing is sent until a destination is connected." },
};

/** `NOTIF-003` — the connected destination, as the app shows it. */
export interface ChatDestination {
  id: string;
  /** The destination as the chat service names it, e.g. "#knowledge-updates". */
  channelLabel: string;
  /** The workspace it delivers into, as the chat service names it. */
  serviceLabel: string;
  connectedByName: string;
  selectedEvents: readonly NotificationKind[];
  lastDeliveryLabel: string | null;
  lastFailureLabel: string | null;
  lastFailureReason: string | null;
}
