import { useId, useRef, useState } from "react";
import { errorMessage, mutate, operationKey } from "../../../../client/transport";
import { ChatAudienceHelp, ChatEventFields, selectedChatEvents, type ChatConnection } from "./ChatNotificationFields";

export function ChatTokenForm({ connection, containers, workspaceOwner, onSaved, onCancel }: {
  connection: ChatConnection | null;
  containers: {id:string;name:string}[];
  workspaceOwner: boolean;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const formId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const key = useRef(operationKey());
  const [provider, setProvider] = useState(connection?.provider ?? "slack");
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
          await mutate(connection ? `/api/notifications/chat/destinations/${connection.id}` : "/api/notifications/chat/destinations", {
            provider,
            deliveryMode: String(data.get("deliveryMode")),
            containerId: connection?.containerId ?? (String(data.get("containerId") ?? "") || null),
            operationKey: key.current,
            expectedRevisionId: connection?.revisionId,
            channel: String(data.get("channel")).trim(),
            token: String(data.get("token")).trim(),
            events: data.getAll("events").map(String),
          }, connection ? "PUT" : "POST");
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
      <h3>{connection ? "Update delivery" : "Connect a channel"}</h3>
      <label htmlFor={`${formId}-provider`}>Provider</label>
        <select id={`${formId}-provider`} value={provider} disabled={pending || !!connection} onChange={event => setProvider(event.target.value as "slack" | "teams")}>
          <option value="slack">Slack</option><option value="teams">Microsoft Teams</option>
        </select>
      <label htmlFor={`${formId}-container`}>Events from</label>
        <select id={`${formId}-container`} name="containerId" defaultValue={connection?.containerId ?? (workspaceOwner ? "" : containers[0]?.id)} disabled={pending || !!connection}>
          {workspaceOwner ? <option value="">Whole workspace</option> : null}
          {containers.map(container => <option key={container.id} value={container.id}>{container.name}</option>)}
        </select>
      {provider === "slack" ? <><ChatAudienceHelp />
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
      </> : <>
        <p>Use a delegated Microsoft Graph access token with ChannelMessage.Send, Channel.ReadBasic.All,
          ChannelMember.Read.All and TeamMember.Read.All permissions. Use a private channel or private team with no guests, external members or other bots. Slate also needs Organization.Read.All, User.Read.All and TeamsAppInstallation.ReadForTeam.All to verify the complete audience. Every channel member’s
          email must match an active Slate member with access to the linked page.</p>
        <label>Teams team/channel IDs
          <input name="channel" required autoComplete="off" spellCheck={false} disabled={pending}
            defaultValue={connection?.destination.replace(/^teams:/, "") ?? ""} />
        </label>
        <p className="muted">Enter the team ID and channel ID separated by a slash.</p>
        <label>Microsoft Graph access token
          <input name="token" type="password" required autoComplete="new-password" spellCheck={false} disabled={pending} />
        </label>
        <p className="muted">Tokens are encrypted and never displayed. Reconnect with a fresh delegated token when authorization expires.</p>
      </>}
      <label htmlFor={`${formId}-mode`}>Delivery schedule</label>
      <select id={`${formId}-mode`} name="deliveryMode" defaultValue={connection?.deliveryMode ?? "immediate"} disabled={pending}>
        <option value="immediate">Immediate</option><option value="daily">Daily digest</option>
      </select>
      <p className="muted">Immediate updates wait until the minute closes to combine busy bursts. Daily digests arrive after midnight UTC.</p>
      <ChatEventFields selected={selectedChatEvents(connection)} disabled={pending} />
      <button disabled={pending}>{pending ? "Saving…" : "Save chat delivery"}</button>
      {onCancel ? <button type="button" disabled={pending} onClick={onCancel}>Cancel</button> : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </form>
  );
}
