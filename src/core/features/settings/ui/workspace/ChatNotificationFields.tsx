import { eventLabel } from "../../../notifications/ui/notificationText";
import "./chat-event-fields.css";
export interface ChatConnection {
  id: string;
  destination: string;
  provider: "slack" | "teams" | "nook";
  deliveryMode: "immediate" | "daily";
  containerId: string | null;
  targetLabel: string;
  state: string;
  heldCount: number;
  needsAttentionReason: string | null;
  revisionId: string;
  connectionId: string | null;
  connectionRevisionId: string | null;
  eventsJson: string;
  lastDeliveredAt: string | null;
  lastFailedAt: string | null;
  lastFailureReason: string | null;
}

const events = [
  "mention", "comment", "reply", "published", "page-edited", "post-published", "review-requested", "verification-lapsed",
  "verification-rules", "access-granted", "run-review", "run-failed",
  "decision-required", "contradiction", "experiment-result", "maintenance",
];

export function selectedChatEvents(connection: ChatConnection | null): string[] {
  return connection ? JSON.parse(connection.eventsJson) : [];
}

export function ChatEventFields({ selected, disabled }: { selected: string[]; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled} className="chat-event-fields">
      <legend>Events to send</legend>
      {[...new Set([...events, ...selected])].map((event) => (
        <label key={event}>
          <input type="checkbox" name="events" value={event}
            defaultChecked={selected.includes(event)} style={{ flexShrink: 0 }} />
          <span>{eventLabel(event)}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function ChatAudienceHelp() {
  return (
    <p className="muted">
      Only people with access to the page receive its notifications.
    </p>
  );
}
