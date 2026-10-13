import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import type { MemberView, Theme } from "../../../../shared/api/workspace";
import { RequestState } from "../../../../app/ui/RequestState";
export function AppearancePanel() {
  const resource = useResource<MemberView>("/api/members/current");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  async function save(theme: Theme) {
    setPending(true);
    setError(undefined);
    try {
      await mutate(
        "/api/members/current/theme",
        { operationKey: operationKey(), theme },
        "PUT",
      );
      window.dispatchEvent(new CustomEvent("slate-appearance", {detail: theme}));
      resource.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="settings-panel">
      <h2>A little more you.</h2>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <fieldset disabled={pending}>
          <legend>Appearance</legend>
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "Match device"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="theme"
                checked={resource.data?.theme === value}
                onChange={() => void save(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </RequestState>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
      <p className="muted">
        Your preference follows your account. Motion respects your device’s
        reduced-motion setting.
      </p>
    </section>
  );
}
