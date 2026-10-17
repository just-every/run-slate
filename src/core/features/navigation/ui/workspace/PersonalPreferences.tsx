import {WatchDefaults} from './WatchDefaults';
import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
type Preferences = {
  sidebarCollapsed: boolean;
  collapsedContainers: string[];
  timezone: string;
  quietRoutine: boolean;
  autowatch?: boolean|null;
};
export function PersonalPreferences() {
  const resource = useResource<{
    value: Preferences;
    autowatchDefault: boolean;
    revisionId: string | null;
  }>("/api/navigation/preferences");
  return (
    <section className="settings-panel">
      <h2>Keep the signal.</h2>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {resource.data ? (
          <PreferencesForm
            key={resource.data.revisionId}
            value={resource.data.value}
            autowatchDefault={resource.data.autowatchDefault}
            revisionId={resource.data.revisionId}
            saved={resource.reload}
          />
        ) : null}
      </RequestState>
      <WatchDefaults saved={resource.reload}/>
    </section>
  );
}
function PreferencesForm({
  value,
  revisionId,
  autowatchDefault,
  saved,
}: {
  value: Preferences;
  revisionId: string | null;
  autowatchDefault: boolean;
  saved: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className="detail-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(undefined);
        try {
          await mutate(
            "/api/navigation/preferences",
            {
              operationKey: operationKey(),
              expectedRevisionId: revisionId,
              value: draft,
            },
            "PUT",
          );
          setConfirmed(true);
          saved();
        } catch (cause) {
          setError(cause);
        } finally {
          setPending(false);
        }
      }}
    >
      <label>
        Automatically watch pages I create, edit or comment on
        <select value={draft.autowatch==null?'default':draft.autowatch?'on':'off'} onChange={event=>setDraft({...draft,autowatch:event.target.value==='default'?null:event.target.value==='on'})}>
          <option value="default">Workspace default ({autowatchDefault?'on':'off'})</option>
          <option value="on">On</option><option value="off">Off</option>
        </select>
      </label>
      <label>
        Timezone
        <input
          required
          value={draft.timezone}
          onChange={(event) =>
            setDraft({ ...draft, timezone: event.target.value })
          }
        />
        <span className="muted">
          For example Australia/Brisbane. Recent pages are grouped by your local
          day.
        </span>
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.quietRoutine}
          onChange={(event) =>
            setDraft({ ...draft, quietRoutine: event.target.checked })
          }
        />
        Keep routine activity quiet
      </label>
      <p className="muted">
        Decisions and work needing your attention remain visible in Today.
      </p>
      <label>
        <input
          type="checkbox"
          checked={draft.sidebarCollapsed}
          onChange={(event) =>
            setDraft({ ...draft, sidebarCollapsed: event.target.checked })
          }
        />
        Start with compact navigation
      </label>
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save preferences"}
      </button>
      {confirmed ? <p role="status">Preferences saved.</p> : null}
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </form>
  );
}
