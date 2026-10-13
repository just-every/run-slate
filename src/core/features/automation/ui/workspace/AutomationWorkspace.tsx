import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import { useEffect, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import { RuleForm } from "./RuleForm";
import type { RuleRow } from "./automationTypes";
export function AutomationWorkspace({sourceId}:{sourceId?:string}={}) {
  const {workspace}=useWorkspace();
  const sourceOnly=workspace.data?.policies["automation.scope.v1"] === "source";
  const rules = useResource<{ items: RuleRow[] }>("/api/automation");
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <section className="settings-panel">
      <h2>Let the routine run.</h2>
      {!sourceOnly || sourceId ? <button onClick={() => setEditing("new")}>New automation</button>:<p>Create and review source automations from a database’s toolbar.</p>}
      <RequestState
        loading={rules.loading}
        error={rules.error}
        retry={rules.reload}
      >
        <ul className="settings-list">
          {rules.data?.items.filter(rule=>sourceId ? rule.source_database_id===sourceId : !sourceOnly).map((rule) => (
            <li key={rule.id}>
              <div>
                <strong>{rule.name}</strong>
                <p>
                  {rule.disabled_at ? "Disabled" : "Enabled"} ·{" "}
                  {rule.scope === "source"
                    ? "Database"
                    : rule.scope === "container"
                      ? "Space"
                      : "Workspace"}
                </p>
              </div>
              <button onClick={() => setEditing(rule)}>Edit</button>
              <button
                onClick={() =>
                  setSelected(selected === rule.id ? null : rule.id)
                }
              >
                Run log
              </button>
            </li>
          ))}
        </ul>
        {rules.data?.items.length === 0 ? (
          <p>
            No automations yet. Start with a recurring action you already trust.
          </p>
        ) : null}
      </RequestState>
      {selected ? <AutomationRunLog id={selected} /> : null}
      {editing ? (
        <RuleForm
          sourceId={sourceId}
          sourceOnly={sourceOnly}
          rule={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={rules.reload}
        />
      ) : null}
    </section>
  );
}
function AutomationRunLog({ id }: { id: string }) {
  const resource = useResource<{
    items: {
      id: string;
      state: string;
      started_at?: string;
      finished_at?: string;
      error_detail?: string;
      reason?: string;
      receipts?: { actionIndex: number; targetId: string; state: string }[];
    }[];
  }>(`/api/automation/${id}/runs`);
  const active = resource.data?.items.some((run) =>
    ["queued", "running"].includes(run.state),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(resource.reload, 4000);
    return () => clearInterval(timer);
  }, [active, resource.reload]);
  return (
    <section>
      <h3>Run log</h3>
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <ol className="settings-list">
          {resource.data?.items.map((run) => (
            <li key={run.id}>
              <div>
                <strong>{run.state.replaceAll("-", " ")}</strong>
                <p>
                  {run.started_at
                    ? new Date(run.started_at).toLocaleString()
                    : "Waiting to start"}
                  {run.finished_at
                    ? ` · Finished ${new Date(run.finished_at).toLocaleString()}`
                    : ""}
                </p>
                {run.error_detail || run.reason ? (
                  <p role="status">{run.error_detail || run.reason}</p>
                ) : null}
                <ul>
                  {run.receipts?.map((receipt, index) => (
                    <li key={index}>
                      Action {receipt.actionIndex + 1}: {receipt.state}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        {resource.data?.items.length === 0 ? (
          <p>No recorded runs for this automation.</p>
        ) : null}
      </RequestState>
    </section>
  );
}
