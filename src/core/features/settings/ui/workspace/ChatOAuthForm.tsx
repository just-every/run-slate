import { useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { errorMessage, mutate, operationKey } from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
import { ChatAudienceHelp, ChatEventFields, selectedChatEvents, type ChatConnection } from "./ChatNotificationFields";

// Mounted only in the flagship profile: core setup never requests OAuth identities.
export function ChatOAuthForm({ connection, onSaved }: {
  connection: ChatConnection | null;
  onSaved: () => Promise<void>;
}) {
  const identities = useResource<{
    items: { id: string; label: string; state: string; revisionId: string }[];
  }>("/api/notifications/chat/identities");
  const [identity, setIdentity] = useState(connection?.connectionId ?? "");
  const channels = useResource<{
    items: { id: string; name: string }[];
    revisionId: string;
  }>(identity ? `/api/notifications/chat/channels?connectionId=${encodeURIComponent(identity)}` : null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const key = useRef(operationKey());
  return (
    <details>
      <summary>Connect through Slack consent</summary>
      <p>Approve Slack’s consent screen, then choose an identity, private channel and events.</p>
      <button type="button" disabled={pending} onClick={async () => {
        setPending(true);
        setError(undefined);
        try {
          const result = await mutate<{ authorizationUrl: string }>(
            "/api/connectors/oauth/slack/start", { purpose: "notifier" },
          );
          window.location.assign(result.authorizationUrl);
        } catch (cause) {
          setError(cause);
          setPending(false);
        }
      }}>Connect Slack with consent</button>
      <RequestState loading={identities.loading} error={identities.error} retry={identities.reload}>
        <form className="detail-form" style={{ minWidth: 0 }}
          onChange={() => { key.current = operationKey(); }}
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setPending(true);
            setError(undefined);
            try {
              await mutate("/api/notifications/chat", {
                operationKey: key.current,
                expectedRevisionId: connection?.revisionId,
                connectionId: identity,
                connectionRevisionId: channels.data?.revisionId,
                channel: String(data.get("channel")),
                events: data.getAll("events").map(String),
              });
              key.current = operationKey();
              await onSaved();
            } catch (cause) {
              setError(cause);
            } finally {
              setPending(false);
            }
          }}>
          <label>Slack identity
            <select required value={identity} disabled={pending} style={{ minWidth: 0 }}
              onChange={(event) => setIdentity(event.target.value)}>
              <option value="" disabled>Choose a connected identity</option>
              {identities.data?.items.filter((item) => item.state === "connected").map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>Private channel
            <select required name="channel" disabled={pending || !channels.data}
              key={`${identity}:${channels.data?.revisionId ?? "loading"}`}
              defaultValue={connection?.destination.replace(/^slack:/, "") ?? ""}
              style={{ minWidth: 0 }}>
              <option value="">Choose a channel</option>
              {channels.data?.items.map((channel) => (
                <option key={channel.id} value={channel.id}>{channel.name}</option>
              ))}
            </select>
          </label>
          <RequestState loading={channels.loading} error={channels.error} retry={channels.reload} />
          <ChatAudienceHelp />
          <ChatEventFields selected={selectedChatEvents(connection)} disabled={pending} />
          <button disabled={pending || !channels.data}>{pending ? "Saving…" : "Save chat delivery"}</button>
        </form>
      </RequestState>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </details>
  );
}
