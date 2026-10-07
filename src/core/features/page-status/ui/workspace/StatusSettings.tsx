import { useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { RequestState } from "../../../../app/ui/RequestState";
import type { StatusEntry } from "./PageStatusPanel";
export function StatusSettings() {
  const { member } = useWorkspace();
  const resource = useResource<{ items: StatusEntry[] }>("/api/status");
  const [editing, setEditing] = useState<StatusEntry | "new" | null>(null);
  const key = useRef("");
  const start = (value: StatusEntry | "new") => {
    key.current = operationKey();
    setEditing(value);
  };
  return (
    <section className="settings-panel">
      <p className="eyebrow">SHARED VOCABULARY</p>
      <h2>Name the state of the work.</h2>
      {member.role === "owner" ? (
        <button onClick={() => start("new")}>Add status</button>
      ) : (
        <p>Workspace owners maintain these statuses.</p>
      )}
      <RequestState
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        <ul className="settings-list">
          {resource.data?.items.map((item) => (
            <li key={item.key}>
              <div>
                <span style={{ color: item.color }}>●</span> {item.label}
                {item.retiredAt ? " · Retired" : ""}
                {item.requiresVerification
                  ? " · Requires human verification"
                  : ""}
              </div>
              {member.role === "owner" ? (
                <button onClick={() => start(item)}>Edit</button>
              ) : null}
            </li>
          ))}
        </ul>
      </RequestState>
      {editing ? (
        <ActionDialog
          title={editing === "new" ? "Add status" : "Edit status"}
          action="Save status"
          onClose={() => setEditing(null)}
          onSubmit={async (data) => {
            await mutate("/api/status", {
              operationKey: key.current,
              key: editing === "new" ? crypto.randomUUID() : editing.key,
              label: String(data.get("label")),
              color: String(data.get("color")),
              requiresVerification: data.get("verification") === "on",
              retire: data.get("retire") === "on",
            });
            resource.reload();
          }}
        >
          <label>
            Name
            <input
              name="label"
              required
              maxLength={20}
              defaultValue={editing === "new" ? "" : editing.label}
            />
          </label>
          <label>
            Colour
            <input
              type="color"
              name="color"
              defaultValue={editing === "new" ? "#54735b" : editing.color}
            />
          </label>
          <label>
            <input
              type="checkbox"
              name="verification"
              defaultChecked={
                editing === "new" ? false : !!editing.requiresVerification
              }
            />
            Require a human to verify the exact revision
          </label>
          {editing !== "new" ? (
            <label>
              <input
                type="checkbox"
                name="retire"
                defaultChecked={!!editing.retiredAt}
              />
              Retire this status
            </label>
          ) : null}
        </ActionDialog>
      ) : null}
    </section>
  );
}
