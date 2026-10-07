import { AlertTriangle } from "lucide-react";
import { useId } from "react";
import { Badge, Button, Checkbox, EmptyState, cn } from "../../../ui";
import { SettingsSection } from "./SettingsSection";
import { pageBodyNoun } from "./nouns";
import type { ChatConnection } from "./types";

/**
 * `NOTIF-003` — one chat destination, the events chosen for it, its last
 * delivery and its last failure.
 *
 * An expired or revoked authorisation marks the connection as needing
 * attention and stops sending without deleting the connection, its event
 * selection or its delivery history; reconnecting restores sending.
 * Disconnecting destroys the credential. The credential itself is never on
 * screen, and no message ever carries the page body.
 */
export function ConnectedServicesSection({
  connection,
  onToggleEvent,
  onReconnect,
  onDisconnect,
  onConnect,
  canAdminister,
  busy = false,
  className,
}: {
  /** `null` when no chat destination is connected. */
  connection: ChatConnection | null;
  onToggleEvent: (eventId: string, selected: boolean) => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onConnect: () => void;
  canAdminister: boolean;
  busy?: boolean;
  className?: string;
}) {
  const fieldId = useId();

  return (
    <SettingsSection
      className={className}
      description={`Slate can post to one chat destination when a chosen event happens. A message carries the event, who did it, the page title and a link — never the ${pageBodyNoun} — and the link still requires access.`}
      title="Connected services"
    >
      {connection === null ? (
        <EmptyState
          action={
            <Button disabled={!canAdminister || busy} onClick={onConnect}>
              Connect a chat destination
            </Button>
          }
          description={
            canAdminister
              ? "Nothing is sent until a destination is connected and at least one event is chosen."
              : "Only a workspace owner connects a chat destination."
          }
          title="No chat destination is connected"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {connection.state === "needs-attention" ? (
            <div className="flex flex-col gap-2 rounded-card border border-warn/40 bg-warn-soft p-3" role="status">
              <p className="flex items-center gap-1.5 text-ui font-medium text-warn">
                <AlertTriangle aria-hidden="true" className="size-4" />
                This connection needs attention
              </p>
              <p className="text-ui text-ink-muted">
                {connection.attentionReason ?? "The authorisation is no longer valid."} Slate has stopped sending and
                has kept the connection, the events you chose and the delivery history.
              </p>
              <div>
                <Button disabled={!canAdminister || busy} onClick={onReconnect} size="sm">
                  Reconnect
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-sidebar p-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-ui font-medium text-ink">
                {connection.destinationName}
                <Badge tone={connection.state === "connected" ? "good" : "warn"}>
                  {connection.state === "connected" ? "Sending" : "Not sending"}
                </Badge>
              </p>
              <p className="text-tiny text-ink-muted">
                {connection.serviceName} · connected by {connection.connectedByName} on {connection.connectedOn}
              </p>
              <p className="mt-1 text-tiny text-ink-faint">
                The credential for this connection is stored encrypted, is returned by no response, and is destroyed
                when you disconnect.
              </p>
            </div>
            <Button disabled={!canAdminister || busy} onClick={onDisconnect} variant="danger">
              Disconnect
            </Button>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-ui font-medium text-ink">Events that reach this destination</legend>
            <div className="flex flex-col gap-1.5">
              {connection.events.map((event) => (
                <label className="flex items-center gap-2 text-ui text-ink" key={event.id}>
                  <Checkbox
                    checked={event.selected}
                    disabled={!canAdminister || busy}
                    id={`${fieldId}-${event.id}`}
                    onCheckedChange={(next) => onToggleEvent(event.id, next === true)}
                  />
                  {event.label}
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DeliveryFact
              detail={connection.lastDelivery?.summary ?? null}
              emptyText="Nothing has been delivered yet."
              label="Last delivery"
              when={connection.lastDelivery?.at ?? null}
            />
            <DeliveryFact
              detail={connection.lastFailure?.reason ?? null}
              emptyText="No delivery has failed."
              label="Last failure"
              tone="danger"
              when={connection.lastFailure?.at ?? null}
            />
          </dl>
        </div>
      )}
    </SettingsSection>
  );
}

function DeliveryFact({
  label,
  when,
  detail,
  emptyText,
  tone = "neutral",
}: {
  label: string;
  when: string | null;
  detail: string | null;
  emptyText: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-card border border-line p-3">
      <dt className="text-micro tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className={cn("mt-0.5 text-ui", when === null ? "text-ink-muted" : "text-ink")}>
        {when === null ? (
          emptyText
        ) : (
          <>
            <span className="block font-medium">{when}</span>
            <span className={cn("block text-tiny", tone === "danger" ? "text-danger" : "text-ink-muted")}>
              {detail}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}
