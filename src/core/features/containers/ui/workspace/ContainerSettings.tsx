import {ContainerWatchers} from './ContainerWatch';
import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import { useRef, useState } from "react";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { Container } from "./ContainerWorkspace";
import { ContainerSharing } from "./ContainerSharing";
import { VerificationRulesPanel } from "../../../page-status/rules/ui/VerificationRulesPanel";
const visibilityOptions = [
  ["default", "Default — Workspace grants admit members; others need a named grant."],
  ["open", "Open — Workspace grants admit the team; others need a named grant."],
  ["closed", "Closed — Granted people and groups may see and join."],
  ["private", "Private — Granted people and groups may see and join."],
] as const;
const externalSettings = [
  ["guestAccess", "Guest access"],
  ["publicLinkAccess", "Public link access"],
  ["anonymousAccess", "Anonymous access"],
] as const;

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
    <section aria-label="Space settings">
      <h4>Space settings</h4>
      {classLed && container.visibility !== "personal" ? (
        <section aria-label="Space visibility">
          <h4>Visibility</h4>
          <p>{visibilityOptions.find(([value]) => value === container.visibility)?.[1]}</p>
          <p>Current grants decide who may see and join. A workspace grant admits workspace members at any visibility; guests need a named grant and allowed guest access.</p>
          <button className="secondary-button" onClick={() => start("access")}>Visibility &amp; public access</button>
        </section>
      ) : null}
      <ContainerWatchers id={container.id}/>
      <div className="action-row">
        <button className="secondary-button" onClick={() => start("details")}>Edit details</button>
        {container.visibility !== "personal" ? (
          <>
            <button className="secondary-button" onClick={() => start("archive")}>
              {container.archivedAt ? "Restore space" : "Archive space"}
            </button>
          </>
        ) : (
          <p>Your personal space stays private. Only you may see or join it.</p>
        )}
      </div>
      {container.visibility !== "personal" ? (
        classLed ? <details className="space-access-details"><summary>Manage access</summary><ContainerSharing id={container.id}/></details>:<ContainerSharing id={container.id}/>
      ) : null}
      {!classLed && container.visibility !== "personal" ? (
        <section className="settings-panel" aria-label="External access">
          <h4>External access</h4>
          <dl className="settings-facts">{externalSettings.map(([setting, label]) => (
            <div key={setting}><dt>{label}</dt><dd>{container[setting] === "allowed" ? "Allowed within workspace policy" : "Forbidden"}</dd></div>
          ))}</dl>
          <button className="secondary-button" onClick={() => start("access")}>External access</button>
        </section>
      ) : null}
      <VerificationRulesPanel containerId={container.id} />
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
                  {visibilityOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label> : null}
              {externalSettings.map(([setting, label]) => (
                <label key={setting}>
                  {label}
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
