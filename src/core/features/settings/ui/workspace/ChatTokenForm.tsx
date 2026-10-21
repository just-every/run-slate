import { useRef, useState } from "react";
import { errorMessage, mutate, operationKey } from "../../../../client/transport";
import { ChatAudienceHelp, ChatEventFields, selectedChatEvents, type ChatConnection } from "./ChatNotificationFields";

export function ChatTokenForm({ connection, onSaved, onCancel }: {
  connection: ChatConnection | null;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const key = useRef(operationKey());
  return (
    <form className="detail-form" style={{ minWidth: 0 }}
      onChange={() => { key.current = operationKey(); }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setPending(true);
        setError(undefined);
        try {
          await mutate("/api/notifications/chat", {
            operationKey: key.current,
            expectedRevisionId: connection?.revisionId,
            channel: String(data.get("channel")).trim(),
            token: String(data.get("token")).trim(),
            events: data.getAll("events").map(String),
          });
          const token = form.elements.namedItem("token") as HTMLInputElement;
          token.value = "";
          data.delete("token");
          key.current = operationKey();
          await onSaved();
        } catch (cause) {
          setError(cause);
        } finally {
          setPending(false);
        }
      }}>
      <h3>{connection ? "Update Slack delivery" : "Connect a private Slack channel"}</h3>
      <ChatAudienceHelp />
      <details>
        <summary>Prepare your Slack app</summary>
        <p>
          In the app’s OAuth &amp; Permissions settings, add these Bot Token Scopes:
          {" "}<code>chat:write</code>, <code>groups:read</code>,
          {" "}<code>groups:history</code>, <code>users:read</code> and
          {" "}<code>users:read.email</code>. Install or reinstall the app in your
          Slack workspace, then invite it to the private channel. Use a channel
          that is not shared with other workspaces.
        </p>
      </details>
      <label>
        Private channel ID
        <input name="channel" required pattern="[CG][A-Z0-9]+"
          defaultValue={connection?.destination.replace(/^slack:/, "") ?? ""}
          placeholder="C0123456789" autoComplete="off" spellCheck={false}
          disabled={pending} style={{ minWidth: 0 }} />
      </label>
      <p className="muted">Find the channel ID in the channel’s details in Slack.</p>
      <label>
        Slack bot token
        <input name="token" type="password" required autoComplete="new-password"
          spellCheck={false} disabled={pending} style={{ minWidth: 0 }}
          aria-describedby="slack-token-help" />
      </label>
      <p id="slack-token-help" className="muted">
        Enter the Bot User OAuth Token from your Slack app’s OAuth &amp; Permissions
        settings. A fresh token is required when reconnecting. Saved tokens are
        encrypted and never shown here.
      </p>
      <ChatEventFields selected={selectedChatEvents(connection)} disabled={pending} />
      <button disabled={pending}>{pending ? "Saving…" : "Save chat delivery"}</button>
      {onCancel ? <button type="button" disabled={pending} onClick={onCancel}>Cancel</button> : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </form>
  );
}
