import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
  ApiError,
} from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
interface Connection {
  id: string;
  provider: string;
  accountId: string;
  state: string;
  revisionId: string;
}
const names: Record<string, string> = {
  "google-drive": "Google Drive",
  slack: "Slack",
  github: "GitHub",
};
export function ConnectionsPanel() {
  const resource = useResource<{ items: Connection[] }>("/api/connectors");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [remove, setRemove] = useState<Connection>();
  async function prepare(form: HTMLFormElement) {
    setPending(true);
    setError(undefined);
    try {
      const result = await mutate<{ state: string; authorizationUrl?: string }>(
        "/api/connectors/prepare",
        {
          sourceUrl: String(new FormData(form).get("url")),
          operationKey: operationKey(),
        },
      );
      if (result.authorizationUrl)
        window.location.assign(result.authorizationUrl);
      else {
        setConnected(result.state === "connected");
        resource.reload();
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  async function connect(provider: string) {
    setPending(true);
    setError(undefined);
    try {
      const result = await mutate<{ authorizationUrl: string }>(
        `/api/connectors/oauth/${provider}/start`,
        {},
      );
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-panel">
      <h2>Knowledge, with its context.</h2>
      <p>
        Paste a HappyToHelp article, Orbit record, Google document, Slack message, or GitHub issue. Slate uses your
        existing access and asks for sign-in only when needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void prepare(e.currentTarget);
        }}
      >
        <label>
          Source link
          <input type="url" name="url" required placeholder="https://…" />
        </label>
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Checking access…" : "Add source"}
        </button>
      </form>
      {error ? (
        <p role="alert">
          {error instanceof ApiError &&
          error.code === "CONNECTOR_CONFIGURATION_REQUIRED"
            ? "This provider is not connected to this workspace yet. Ask your workspace owner to enable this connection in deployment settings."
            : errorMessage(error)}
        </p>
      ) : null}
      {connected ? (
        <p role="status">
          Source connected. Its available revision can now be used as evidence.
        </p>
      ) : null}
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <ul className="settings-list">
          {resource.data?.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{names[item.provider] ?? item.provider}</strong>
                <p className="muted">
                  {item.accountId} · {item.state}
                </p>
              </div>
              <button className="secondary-button" onClick={() => setRemove(item)}>Disconnect</button>
            </li>
          ))}
        </ul>
      </RequestState>
      <h3>Connect an account</h3>
      <div className="action-row">
        {Object.entries(names).map(([key, name]) => (
          <button
            className="secondary-button"
            key={key}
            disabled={pending}
            onClick={() => void connect(key)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="muted">
        Connections belong to you. Connecting does not give other members access
        to your private sources.
      </p>
      {remove ? (
        <ActionDialog
          title={`Disconnect ${names[remove.provider] ?? remove.provider}?`}
          action="Disconnect"
          onClose={() => setRemove(undefined)}
          onSubmit={async () => {
            await mutate(
              `/api/connectors/${remove.id}`,
              {
                operationKey: operationKey(),
                expectedRevisionId: remove.revisionId,
              },
              "DELETE",
            );
            resource.reload();
          }}
        >
          <p>
            Slate will stop using this connection. Existing citations retain
            their reference, but unavailable content will not be shown.
          </p>
        </ActionDialog>
      ) : null}
    </section>
  );
}
