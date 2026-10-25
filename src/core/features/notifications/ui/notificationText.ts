import type { NotificationEvent } from "../events";

export const eventLabels = {
  "saml-domain-failed": "Domain verification failed", "backup-failed": "A scheduled backup failed",
  "review-requested": "A review was requested", "review-overdue": "A review is overdue", "review-escalated": "A review needs your attention",
  "task-assigned": "A task was assigned to you", "task-due": "A task is due", reminder: "You have a reminder", mention: "You were mentioned",
  comment: "A comment was added", reply: "A reply was added", published: "A page was published", "page-created": "A page was created",
  "page-edited": "A page was edited", "page-moved": "A page was moved", "page-archived": "A page was archived", "page-trashed": "A page was moved to trash",
  "page-restored": "A page was restored", "post-published": "A post was published", "verification-lapsed": "A page needs verification",
  "verification-rules": "Page verification changed", "access-granted": "Access was granted", "access-requested": "Access was requested",
  "run-review": "A result needs your review", "run-failed": "A run failed", "decision-required": "A decision is needed",
  contradiction: "A contradiction was found", "experiment-result": "An experiment has results", maintenance: "Workspace maintenance completed",
} satisfies Record<NotificationEvent, string>;

export function eventLabel(event: string) {
  if (event in eventLabels) return eventLabels[event as NotificationEvent];
  const words = event.replace(/[._-]+/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface NotificationSentence { event: string; title: string | null; actor?: { displayName: string } | null }
export function notificationText(item: NotificationSentence) {
  const person = item.actor?.displayName;
  const verbs: Record<string, string> = {"task-assigned": "assigned you a task on", "review-requested": "requested your review of", "access-granted": "gave you access to", "access-requested": "requested access to", "decision-required": "requested a decision on", comment: "commented on", reply: "replied on", mention: "mentioned you on", published: "published", "page-created": "created", "page-edited": "edited", "page-moved": "moved", "page-archived": "archived", "page-trashed": "moved to trash:", "page-restored": "restored", "post-published": "published a post:"};
  if (verbs[item.event]) return `${person ?? "Someone"} ${verbs[item.event]} ${item.title ?? "a page"}`;
  return `${person ? `${person}: ` : ""}${eventLabel(item.event)}${item.title ? ` · ${item.title}` : ""}`;
}
