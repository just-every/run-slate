import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import { useRef, useState } from "react";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { Container } from "./ContainerWorkspace";
import { ContainerSharing } from "./ContainerSharing";
export function ContainerSettings({
  container,
  onSaved,
}: {
  container: Container;
  onSaved: () => void;
}) {
  const {workspace}=useWorkspace();
  const classLed=workspace.data?.policies["container.access.v1"] !== "grant-led";
  const [action, setAction] = useState<string | null>(null);
  const key = useRef("");
  const start = (next: string) => {
    key.current = operationKey();
    setAction(next);
  };
  if (!container.permissions.canManage)
    return <p>You may read this space. Its owners manage its settings.</p>;
  return (
    <section>
      <h4>Space settings</h4>
      <div className="action-row">
        <button onClick={() => start("details")}>Edit details</button>
        {container.visibility !== "personal" ? (
          <>
            <button onClick={() => start("access")}>
              {classLed ? "Visibility & public access" : "External access"}
            </button>
            <button onClick={() => start("archive")}>
              {container.archivedAt ? "Restore space" : "Archive space"}
            </button>
          </>
        ) : (
          <p>Your personal space stays private.</p>
        )}
      </div>
      {container.visibility !== "personal" ? (
        classLed ? <details><summary>Manage access</summary><ContainerSharing id={container.id}/></details>:<ContainerSharing id={container.id}/>
      ) : null}
      {action ? (
        <ActionDialog
          title={
            action === "details"
              ? "Space details"
              : action === "access"
                ? "Space access"
                : container.archivedAt
                  ? "Restore this space"
                  : "Archive this space"
          }
          action={
            action === "archive"
              ? container.archivedAt
                ? "Restore"
                : "Archive"
              : "Save settings"
          }
          onClose={() => setAction(null)}
          onSubmit={async (data) => {
            const common = {
              operationKey: key.current,
              expectedRevisionId: container.revisionId,
            };
            if (action === "details")
              await mutate(
                `/api/containers/${container.id}`,
                {
                  ...common,
                  name: String(data.get("name")),
                  description: String(data.get("description")),
                  icon: String(data.get("icon")) || null,
                  key: String(data.get("key")) || null,
                },
                "PATCH",
              );
            else if (action === "access")
              await mutate("/api/sharing/container-settings", {
                ...common,
                id: container.id,
                visibility: classLed ? String(data.get("visibility")) : container.visibility,
                guestAccess: String(data.get("guestAccess")),
                publicLinkAccess: String(data.get("publicLinkAccess")),
                anonymousAccess: String(data.get("anonymousAccess")),
              });
            else
              await mutate(`/api/containers/${container.id}/archive`, {
                ...common,
                restore: !!container.archivedAt,
                reason: String(data.get("reason")),
              });
            await onSaved();
          }}
        >
          {action === "details" ? (
            <>
              <label>
                Name
                <input name="name" required defaultValue={container.name} />
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={container.description}
                />
              </label>
              <label>
                Icon
                <input name="icon" defaultValue={container.icon ?? ""} />
              </label>
              <label>
                Short key
                <input name="key" defaultValue={container.key ?? ""} />
              </label>
            </>
          ) : action === "access" ? (
            <>
              {classLed ? <label>
                Visibility
                <select name="visibility" defaultValue={container.visibility}>
                  {["default", "open", "closed", "private"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label> : null}
              {(
                ["guestAccess", "publicLinkAccess", "anonymousAccess"] as const
              ).map((setting, index) => (
                <label key={setting}>
                  {
                    ["Guest access", "Public link access", "Anonymous access"][
                      index
                    ]
                  }
                  <select name={setting} defaultValue={container[setting]}>
                    <option value="allowed">
                      Allowed within workspace policy
                    </option>
                    <option value="forbidden">Forbidden</option>
                  </select>
                </label>
              ))}
            </>
          ) : (
            <>
              <p>
                {container.archivedAt
                  ? "Restore this space and its archived page tree."
                  : "Archive the entire space and its page tree. This removes it from active navigation; it can be restored."}
              </p>
              <label>
                Reason
                <textarea name="reason" />
              </label>
            </>
          )}
        </ActionDialog>
      ) : null}
    </section>
  );
}
