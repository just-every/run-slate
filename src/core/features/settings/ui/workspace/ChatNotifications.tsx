import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { RequestState } from "../../../../app/ui/RequestState";
export function ChatNotifications() {
  const { member } = useWorkspace();
  const allowed = member.role === "owner";
  const flagship = useFlagshipEnabled();
  const current = useResource<{
    connection: null | {
      id: string;
      targetLabel: string;
      state: string;
      needsAttentionReason: string | null;
      revisionId: string;
      connectionId: string;
      connectionRevisionId: string;
      eventsJson: string;
      lastDeliveredAt: string | null;
      lastFailedAt: string | null;
      lastFailureReason: string | null;
    };
  }>(allowed ? "/api/notifications/chat" : null);
  const identities = useResource<{
    items: { id: string; label: string; state: string; revisionId: string }[];
  }>(allowed ? "/api/notifications/chat/identities" : null);
  const [identity, setIdentity] = useState("");
  const channels = useResource<{
    items: { id: string; name: string }[];
    revisionId: string;
  }>(
    identity
      ? `/api/notifications/chat/channels?connectionId=${encodeURIComponent(identity)}`
      : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const key = useRef(operationKey());
  async function connect() {
    setPending(true);
    setError(undefined);
    try {
      const result = await mutate<{ authorizationUrl: string }>(
        "/api/connectors/oauth/slack/start",
        { purpose: "notifier" },
      );
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause);
      setPending(false);
    }
  }
  if (!allowed) return <p>A workspace owner manages delivery to chat.</p>;
  return (
    <section className="settings-panel">
      <h2>Send updates to Slack.</h2>
      <RequestState
        loading={current.loading}
        error={current.error}
        retry={current.reload}
      >
        {current.data?.connection ? (
          <section>
            <h3>{current.data.connection.targetLabel}</h3>
            <p>{current.data.connection.state}</p>
            {current.data.connection.needsAttentionReason ||
            current.data.connection.lastFailureReason ? (
              <p role="alert">
                {current.data.connection.needsAttentionReason ||
                  current.data.connection.lastFailureReason}
              </p>
            ) : null}
            {current.data.connection.lastDeliveredAt ? (
              <p>
                Last delivered{" "}
                {new Date(
                  current.data.connection.lastDeliveredAt,
                ).toLocaleString()}
              </p>
            ) : (
              <p>No confirmed delivery yet.</p>
            )}
            <button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                try {
                  await mutate(
                    `/api/notifications/chat/${current.data!.connection!.id}`,
                    {
                      operationKey: operationKey(),
                      expectedRevisionId: current.data!.connection!.revisionId,
                    },
                    "DELETE",
                  );
                  current.reload();
                } catch (cause) {
                  setError(cause);
                } finally {
                  setPending(false);
                }
              }}
            >
              Disconnect delivery
            </button>
          </section>
        ) : (
          <p>No chat delivery is connected.</p>
        )}
      </RequestState>
      {!flagship ? <p>Connecting a new chat service is unavailable in the core-wiki profile. Existing delivery settings remain available.</p> : null}
      <button disabled={pending || !flagship} onClick={() => void connect()}>
        Connect Slack with consent
      </button>
      <RequestState
        loading={identities.loading}
        error={identities.error}
        retry={identities.reload}
      >
        <form
          className="detail-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPending(true);
            setError(undefined);
            try {
              await mutate("/api/notifications/chat", {
                operationKey: key.current,
                expectedRevisionId: current.data?.connection?.revisionId,
                connectionId: identity,
                connectionRevisionId: channels.data?.revisionId,
                channel: String(data.get("channel")),
                events: data.getAll("events").map(String),
              });
              key.current = operationKey();
              current.reload();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Slack identity
            <select
              required
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
            >
              <option value="" disabled>
                Choose a connected identity
              </option>
              {identities.data?.items
                .filter((item) => item.state === "connected")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Private channel
            <select required name="channel" disabled={!channels.data}>
              <option value="">Choose a channel</option>
              {channels.data?.items.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          {channels.error ? (
            <p role="alert">{errorMessage(channels.error)}</p>
          ) : null}
          <p className="muted">
            Only authorized private channels with known members are offered.
            Delivery checks access again at send time.
          </p>
          <fieldset>
            <legend>Events</legend>
            {[
              "mention",
              "comment",
              "reply",
              "published",
              "verification-lapsed",
              "access-granted",
              "run-review",
              "run-failed",
              "decision-required",
              "contradiction",
              "experiment-result",
              "maintenance",
            ].map((event) => (
              <label key={event}>
                <input type="checkbox" name="events" value={event} />
                {event.replaceAll("-", " ")}
              </label>
            ))}
          </fieldset>
          <button disabled={pending || !channels.data}>
            Save chat delivery
          </button>
        </form>
      </RequestState>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
