import { eventLabel } from "../../../notifications/ui/notificationText";
import { DateStamp } from "../../../../app/ui/displayDate";
import { useState } from "react";
import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
import { selectedChatEvents, type ChatConnection } from "./ChatNotificationFields";
import { ChatTokenForm } from "./ChatTokenForm";
import { ChatOAuthForm } from "./ChatOAuthForm";
import { HeldChatDelivery } from "./HeldChatDelivery";

export function ChatNotifications() {
  const flagship = useFlagshipEnabled();
  const current = useResource<{ items: ChatConnection[]; containers: {id:string;name:string}[]; workspaceOwner:boolean }>(
    "/api/notifications/chat/destinations",
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const connections = current.data?.items ?? [];
  const selected = connections.find(item => item.id === editing) ?? null;
  const showForm = editing !== null || connections.length === 0;
  async function saved() {
    setEditing(null);
    setError(undefined);
    setNotice("Chat delivery saved.");
    await current.reload();
  }

  return (
    <section className="settings-panel" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
      <h2>Send updates to chat.</h2>
      <p>Connect Slack, Microsoft Teams or Nook channels. Choose the scope and events for each destination.</p>
      {notice ? <p role="status">{notice}</p> : null}
      <RequestState loading={current.loading} error={current.error} retry={current.reload}>
        {connections.length ? connections.map(connection => (
          <section key={connection.id} aria-label={`${connection.provider === "teams" ? "Teams" : connection.provider === "nook" ? "Nook" : "Slack"} delivery status: ${connection.targetLabel}`}>
            <h3>{connection.targetLabel}</h3>
            <p role="status">
              {connection.heldCount > 0 ? "Needs attention" : connection.state === "connected" ? "Connected" :
                connection.state === "disconnected" ? "Disconnected" :
                  connection.state === "needs-attention" ? "Needs attention" : connection.state}
            </p>
            {connection.state !== "disconnected" && connection.needsAttentionReason ? (
              <p role="alert">{connection.needsAttentionReason}</p>
            ) : null}
            {connection.heldCount > 0 ? <HeldChatDelivery connection={connection} onResolved={current.reload} /> : null}
            <p>Delivery: {connection.deliveryMode === "daily" ? "Daily digest" : "Immediate"}.</p>
            <p>Selected events: {selectedChatEvents(connection).map(eventLabel).join(", ") || "None"}.</p>
            <p>{connection.lastDeliveredAt ? <>
              Last delivered: <DateStamp value={connection.lastDeliveredAt} />
            </> : "No confirmed delivery yet."}</p>
            <p>{connection.lastFailedAt ? <>
              Last failed: <DateStamp value={connection.lastFailedAt} />
              {connection.lastFailureReason ? ` — ${connection.lastFailureReason}` : null}
            </> : "No delivery failure recorded."}</p>
            {editing !== connection.id ? (
              <button disabled={pending} onClick={() => { setEditing(connection.id); setNotice(""); }}>
                {connection.state === "connected" ? "Edit delivery" : "Reconnect"}
              </button>
            ) : null}
            {connection.state !== "disconnected" ? (
              <button disabled={pending || editing === connection.id} onClick={async () => {
                setPending(true);
                setError(undefined);
                setNotice("");
                try {
                  await mutate(`/api/notifications/chat/${connection.id}`, {
                    operationKey: operationKey(), expectedRevisionId: connection.revisionId,
                  }, "DELETE");
                  setEditing(null);
                  setNotice("Chat delivery disconnected.");
                  await current.reload();
                } catch (cause) {
                  setError(cause);
                } finally {
                  setPending(false);
                }
              }}>{pending ? "Disconnecting…" : "Disconnect delivery"}</button>
            ) : null}
          </section>
        )) : <p>No chat delivery is connected.</p>}
        {current.data && (current.data.workspaceOwner || current.data.containers.length > 0) ? <>
          {!showForm ? <button onClick={() => {setEditing("new");setNotice("");}}>Add destination</button> : null}
          {showForm ? <ChatTokenForm key={selected?.revisionId ?? "new"} connection={selected}
            containers={current.data.containers} workspaceOwner={current.data.workspaceOwner}
            onSaved={saved} onCancel={connections.length ? () => setEditing(null) : undefined} /> : null}
          {showForm && flagship && current.data.workspaceOwner && (!selected || selected.provider === "slack") ? (
            <ChatOAuthForm key={selected?.revisionId ?? "new"} connection={selected} onSaved={saved} />
          ) : null}
        </> : current.data ? <p>A workspace owner or container owner manages delivery to chat.</p> : null}
      </RequestState>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
