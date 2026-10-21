import { useState } from "react";
import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { RequestState } from "../../../../app/ui/RequestState";
import { selectedChatEvents, type ChatConnection } from "./ChatNotificationFields";
import { ChatTokenForm } from "./ChatTokenForm";
import { ChatOAuthForm } from "./ChatOAuthForm";

export function ChatNotifications() {
  const { member } = useWorkspace();
  const allowed = member.role === "owner";
  const flagship = useFlagshipEnabled();
  const current = useResource<{ connection: ChatConnection | null }>(
    allowed ? "/api/notifications/chat" : null,
  );
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const connection = current.data?.connection ?? null;
  async function saved() {
    setEditing(false);
    setError(undefined);
    setNotice("Slack delivery saved.");
    await current.reload();
  }
  if (!allowed) return <p>A workspace owner manages delivery to chat.</p>;
  return (
    <section className="settings-panel" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <h2>Send updates to Slack.</h2>
      <p>Choose one private Slack channel and the events to send.</p>
      {notice ? <p role="status">{notice}</p> : null}
      <RequestState loading={current.loading} error={current.error} retry={current.reload}>
        {connection ? (
          <section aria-label="Slack delivery status">
            <h3>{connection.targetLabel}</h3>
            <p role="status">
              {connection.state === "connected" ? "Connected" :
                connection.state === "disconnected" ? "Disconnected" :
                  connection.state === "needs-attention" ? "Needs attention" : connection.state}
            </p>
            {connection.state !== "disconnected" && connection.needsAttentionReason ? (
              <p role="alert">{connection.needsAttentionReason}</p>
            ) : null}
            <p>Selected events: {selectedChatEvents(connection).map((event) => event.replaceAll("-", " ")).join(", ") || "None"}.</p>
            <p>{connection.lastDeliveredAt ? <>
              Last delivered: <time dateTime={connection.lastDeliveredAt}>{new Date(connection.lastDeliveredAt).toLocaleString()}</time>
            </> : "No confirmed delivery yet."}</p>
            <p>{connection.lastFailedAt ? <>
              Last failed: <time dateTime={connection.lastFailedAt}>{new Date(connection.lastFailedAt).toLocaleString()}</time>
              {connection.lastFailureReason ? ` — ${connection.lastFailureReason}` : null}
            </> : "No delivery failure recorded."}</p>
            {!editing ? (
              <button disabled={pending} onClick={() => { setEditing(true); setNotice(""); }}>
                {connection.state === "connected" ? "Edit delivery" : "Reconnect"}
              </button>
            ) : null}
            {connection.state !== "disconnected" ? (
              <button disabled={pending || editing} onClick={async () => {
                setPending(true);
                setError(undefined);
                setNotice("");
                try {
                  await mutate(`/api/notifications/chat/${connection.id}`, {
                    operationKey: operationKey(), expectedRevisionId: connection.revisionId,
                  }, "DELETE");
                  setEditing(false);
                  setNotice("Slack delivery disconnected.");
                  await current.reload();
                } catch (cause) {
                  setError(cause);
                } finally {
                  setPending(false);
                }
              }}>{pending ? "Disconnecting…" : "Disconnect delivery"}</button>
            ) : null}
          </section>
        ) : <p>No chat delivery is connected.</p>}
        {current.data && (!connection || editing) ? (
          <ChatTokenForm key={connection?.revisionId ?? "new"} connection={connection}
            onSaved={saved} onCancel={connection ? () => setEditing(false) : undefined} />
        ) : null}
        {current.data && flagship ? (
          <ChatOAuthForm key={connection?.revisionId ?? "new"} connection={connection} onSaved={saved} />
        ) : null}
      </RequestState>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
