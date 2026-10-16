import type { Action } from "./automationTypes";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { useResource } from "../../../../client/useResource";
import type { DatabaseDto } from "../../../../client/records";
export function RuleActionsEditor({
  actions,
  onChange,
  sourceId,
}: {
  actions: Action[];
  onChange: (actions: Action[]) => void;
  sourceId?: string;
}) {
  const spaces = useResource<{ items: { id: string; name: string }[] }>(
    "/api/containers",
  );
  const databases = useResource<{ items: { id: string; title: string }[] }>(
    "/api/databases",
  );
  const members = useResource<{ items: { id: string; displayName: string }[] }>(
    "/api/members",
  );
  return (
    <section>
      <h3>Then</h3>
      {actions.map((action, index) => (
        <fieldset key={index}>
          <legend>Action {index + 1}</legend>
          <select
            aria-label={`Action ${index + 1} type`}
            value={action.type}
            onChange={(event) =>
              onChange(
                actions.map((old, i) =>
                  i === index
                    ? {
                        type: event.target.value as Action["type"],
                        ...(["edit-fields", "create-record"].includes(
                          event.target.value,
                        )
                          ? { values: {} }
                          : {}),
                      }
                    : old,
                ),
              )
            }
          >
            {[
              ["edit-fields", "Edit fields"],
              ["create-page", "Create page"],
              ["create-record", "Create record"],
              ["move", "Move page"],
              ["archive", "Archive page"],
              ["comment", "Add comment"],
              ["notify", "Notify people"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ActionFields
            action={action}
            sourceId={sourceId}
            spaces={spaces.data?.items ?? []}
            databases={databases.data?.items ?? []}
            members={members.data?.items ?? []}
            change={(next) =>
              onChange(actions.map((old, i) => (i === index ? next : old)))
            }
          />
          <button
            type="button"
            onClick={() => onChange(actions.filter((_, i) => i !== index))}
          >
            Remove action
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => onChange([...actions, { type: "comment", body: "" }])}
      >
        Add action
      </button>
    </section>
  );
}
function ActionFields({
  action,
  change,
  sourceId,
  spaces,
  databases,
  members,
}: {
  action: Action;
  change: (action: Action) => void;
  sourceId?: string;
  spaces: { id: string; name: string }[];
  databases: { id: string; title: string }[];
  members: { id: string; displayName: string }[];
}) {
  const { localDevelopment } = useWorkspace();
  const fields = useResource<DatabaseDto>(
    action.type === "edit-fields" && sourceId
      ? `/api/databases/${sourceId}`
      : action.type === "create-record" && action.databaseId
        ? `/api/databases/${action.databaseId}`
        : null,
  );
  return (
    <>
      {["create-page", "move"].includes(action.type) ? (
        <label>
          Destination
          <select
            required
            value={action.containerId ?? ""}
            onChange={(event) =>
              change({ ...action, containerId: event.target.value })
            }
          >
            <option value="" disabled>
              Choose a space
            </option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {action.type === "create-record" ? (
        <label>
          Database
          <select
            required
            value={action.databaseId ?? ""}
            onChange={(event) =>
              change({ ...action, databaseId: event.target.value, values: {} })
            }
          >
            <option value="" disabled>
              Choose a database
            </option>
            {databases.map((database) => (
              <option key={database.id} value={database.id}>
                {database.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {["create-page", "create-record"].includes(action.type) ? (
        <label>
          Title
          <input
            required
            value={action.title ?? ""}
            onChange={(event) =>
              change({ ...action, title: event.target.value })
            }
          />
        </label>
      ) : null}
      {action.type === "archive" ? (
        <label>
          Reason
          <input
            value={action.reason ?? ""}
            onChange={(event) =>
              change({ ...action, reason: event.target.value })
            }
          />
        </label>
      ) : null}
      {action.type === "comment" ? (
        <label>
          Comment
          <textarea
            required
            value={typeof action.body === "string" ? action.body : ""}
            onChange={(event) =>
              change({ ...action, body: event.target.value })
            }
          />
        </label>
      ) : null}
      {action.type === "notify" ? (
        <>
          {localDevelopment ? (
            <p>
              No email is sent on this computer. Selected people receive this
              message in their Slate Inbox if they can still read the record.
              Select yourself to try it locally, then open Inbox after the run
              finishes. The owner signs in using the private RER_OPEN link from
              rer dev; this action does not invite new people.
            </p>
          ) : null}
          <label>
            Message
            <textarea
              required
              value={action.message ?? ""}
              onChange={(event) =>
                change({ ...action, message: event.target.value })
              }
            />
          </label>
          <fieldset>
            <legend>Recipients</legend>
            {members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={
                    action.recipientMemberIds?.includes(member.id) ?? false
                  }
                  onChange={(event) =>
                    change({
                      ...action,
                      recipientMemberIds: event.target.checked
                        ? [...(action.recipientMemberIds ?? []), member.id]
                        : (action.recipientMemberIds ?? []).filter(
                            (id) => id !== member.id,
                          ),
                    })
                  }
                />
                {member.displayName}
              </label>
            ))}
          </fieldset>
        </>
      ) : null}
      {["edit-fields", "create-record"].includes(action.type) ? (
        <fieldset>
          <legend>Field changes</legend>
          {fields.data?.fields
            .filter(
              (field) =>
                !field.readOnly &&
                ![
                  "formula",
                  "rollup",
                  "identifier",
                  "created-at",
                  "updated-at",
                ].includes(field.type),
            )
            .map((field) => (
              <label key={field.id}>
                <input
                  type="checkbox"
                  checked={Object.hasOwn(action.values ?? {}, field.id)}
                  onChange={(event) => {
                    const values = { ...action.values };
                    if (event.target.checked)
                      values[field.id] = field.type === "checkbox" ? false : "";
                    else delete values[field.id];
                    change({ ...action, values });
                  }}
                />
                {field.name}
                {Object.hasOwn(action.values ?? {}, field.id) ? (
                  <input
                    type={
                      field.type === "number"
                        ? "number"
                        : field.type === "checkbox"
                          ? "checkbox"
                          : field.type === "date"
                            ? "date"
                            : "text"
                    }
                    value={
                      field.type === "checkbox"
                        ? undefined
                        : String(action.values?.[field.id] ?? "")
                    }
                    checked={
                      field.type === "checkbox"
                        ? Boolean(action.values?.[field.id])
                        : undefined
                    }
                    onChange={(event) =>
                      change({
                        ...action,
                        values: {
                          ...action.values,
                          [field.id]:
                            field.type === "number"
                              ? Number(event.target.value)
                              : field.type === "checkbox"
                                ? event.target.checked
                                : event.target.value,
                        },
                      })
                    }
                  />
                ) : null}
              </label>
            ))}
        </fieldset>
      ) : null}
    </>
  );
}
