import { useEffect, useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { RunPanel } from "../../runs/ui/RunPanel";
interface TrialDetail {
  id: string;
  revision_id: string;
  state: string;
  automatic: boolean;
  pendingReason: string | null;
  observations: {
    id: string;
    subject_id: string;
    arm: string;
    value: number;
    support_work: number;
    observed_at: string;
    effect_id: string | null;
  }[];
  runs: {
    id: string;
    status: string;
    stage: string;
    failure_reason: string | null;
  }[];
}
export function TrialProgress({
  id,
  reload,
}: {
  id: string;
  reload: () => void;
}) {
  const resource = useResource<TrialDetail>(
      `/api/experiments/${encodeURIComponent(id)}`,
    ),
    [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>();
  const trial = resource.data;
  useEffect(() => {
    if (trial?.state !== "active") return;
    const timer = setTimeout(resource.reload, 5000);
    return () => clearTimeout(timer);
  }, [trial, resource.reload]);
  return (
    <RequestState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {trial ? (
        <section>
          {trial.pendingReason ? (
            <p className="request-notice">{trial.pendingReason}</p>
          ) : null}
          {trial.state === "active" ? (
            <>
              <p>
                Slate follows the declared window and checks connected
                observations automatically.
              </p>
              <button
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  setError(undefined);
                  try {
                    await mutate(`/api/experiments/${trial.id}/stop`, {
                      operationKey: operationKey(),
                      expectedRevisionId: trial.revision_id,
                      reason: "Stopped by the responsible member.",
                    });
                    resource.reload();
                    reload();
                  } catch (cause) {
                    setError(cause);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? "Stopping…" : "Stop future trial effects"}
              </button>
            </>
          ) : null}
          <details>
            <summary>Observed outcomes & actual exposure</summary>
            {trial.observations.length ? (
              <div className="table-scroll">
                <table>
                  <caption>Recorded observations</caption>
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Metric</th>
                      <th>Support work</th>
                      <th>Observed</th>
                      <th>Exposure receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trial.observations.map((observation) => (
                      <tr key={observation.id}>
                        <td>{observation.arm}</td>
                        <td>{observation.value}</td>
                        <td>{observation.support_work}</td>
                        <td>
                          {new Date(observation.observed_at).toLocaleString()}
                        </td>
                        <td>
                          {observation.effect_id
                            ? "Retained"
                            : "No treatment receipt"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                No qualifying observations have been recorded. The forecast is
                not an observed outcome.
              </p>
            )}
            {trial.runs.map((run) => (
              <details key={run.id}>
                <summary>Treatment execution · {run.status}</summary>
                <RunPanel id={run.id} />
              </details>
            ))}
          </details>
          {error ? <p role="alert">{errorMessage(error)}</p> : null}
        </section>
      ) : null}
    </RequestState>
  );
}
