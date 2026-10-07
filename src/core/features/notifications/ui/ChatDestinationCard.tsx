import { Link2, MessageSquareShare, ShieldCheck } from "lucide-react";
import { Badge, Button, cn } from "../../../ui";
import { memberNoun, pageBodyNoun } from "./nouns";
import {
  chatDestinationStateCopy,
  notificationKindCopy,
  type ChatDestination,
  type ChatDestinationState,
} from "./types";

/**
 * `NOTIF-003` — the chat destination as it appears inside the app: the compact
 * card, not the settings section that configures it.
 *
 * Design decision: what a message carries is stated on the card rather than
 * only in settings, because the question a reader has here is "what is leaving
 * the workspace?". The answer — event, actor, page title, link, never the page
 * body — is short enough to say in full.
 */
export interface ChatDestinationCardProps {
  state: ChatDestinationState;
  /** Absent only while disconnected: nothing is kept once it is destroyed. */
  destination: ChatDestination | null;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onEditEvents: () => void;
  className?: string;
}

export function ChatDestinationCard({
  state,
  destination,
  onConnect,
  onReconnect,
  onDisconnect,
  onEditEvents,
  className,
}: ChatDestinationCardProps) {
  const copy = chatDestinationStateCopy[state];

  return (
    <section
      aria-label="Chat notifications"
      className={cn("flex w-full max-w-reading flex-col gap-2.5 rounded-card border border-line bg-surface p-3", className)}
    >
      <header className="flex flex-wrap items-center gap-2">
        <MessageSquareShare aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
        <h3 className="text-ui font-medium text-ink">Chat notifications</h3>
        <Badge tone={copy.tone}>{copy.label}</Badge>
      </header>

      <p className="text-tiny text-ink-muted">{copy.statement}</p>

      {destination ? (
        <dl className="flex flex-col gap-1 text-tiny">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-faint">Destination</dt>
            <dd className="text-ink">
              {destination.channelLabel} <span className="text-ink-muted">in {destination.serviceLabel}</span>
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-faint">Connected by</dt>
            <dd className="text-ink">{destination.connectedByName}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-faint">Events</dt>
            <dd className="text-ink">
              {destination.selectedEvents.length === 0
                ? "None chosen yet"
                : destination.selectedEvents.map((kind) => notificationKindCopy[kind].label).join(", ")}
            </dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-faint">Last delivery</dt>
            <dd className="text-ink">{destination.lastDeliveryLabel ?? "Nothing delivered yet"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-ink-faint">Last failure</dt>
            <dd className={destination.lastFailureLabel ? "text-danger" : "text-ink"}>
              {destination.lastFailureLabel
                ? `${destination.lastFailureLabel}${destination.lastFailureReason ? ` — ${destination.lastFailureReason}` : ""}`
                : "No failures"}
            </dd>
          </div>
        </dl>
      ) : null}

      <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
        <Link2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>
          A message carries the event, the {memberNoun} who acted, the page title and a link. It never carries the{" "}
          {pageBodyNoun}, and the link still requires access.
        </span>
      </p>

      <p className="flex items-start gap-1.5 text-tiny text-ink-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
        <span>The credential is never shown here, is returned by no API response, and is destroyed on disconnect.</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {state === "disconnected" ? (
          <Button onClick={onConnect} size="sm" variant="primary">
            Connect a destination
          </Button>
        ) : null}
        {state === "needs-attention" ? (
          <Button onClick={onReconnect} size="sm" variant="primary">
            Reconnect
          </Button>
        ) : null}
        {destination ? (
          <>
            <Button onClick={onEditEvents} size="sm" variant="secondary">
              Choose events
            </Button>
            <Button onClick={onDisconnect} size="sm" variant="ghost">
              Disconnect
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
