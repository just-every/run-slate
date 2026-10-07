import {useWorkspace} from "../../../../app/ui/WorkspaceContext";
import { useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { RequestState } from "../../../../app/ui/RequestState";
export type StatusEntry = {
  key: string;
  label: string;
  color: string;
  requiresVerification: number | boolean;
  retiredAt: string | null;
};
export function PageStatusPanel({
  pageId,
  revision,
  workingRevisionId,
  canEdit,
  onSaved,
}: {
  pageId: string;
  revision: string;
  workingRevisionId:string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const {workspace,member}=useWorkspace();
  const verificationOnly=workspace.data?.policies["page.status.v1"] === "verification-only";
  const statuses = useResource<{ items: StatusEntry[] }>("/api/status");
  const verification = useResource<{
    verification: null | {
      current: boolean;
      lapsed: boolean;
      created_at: string;
      expires_at: string | null;
      revision_id: string;
    };
  }>(`/api/status/page/${pageId}`);
  const [custom,setCustom]=useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const key = useRef("");
  const selectedStatus = statuses.data?.items.find(
    (item) => item.key === selected,
  );
  return (
    <section>
      <h3>Status & human verification</h3>
      <RequestState
        loading={statuses.loading || verification.loading}
        error={statuses.error || verification.error}
        retry={() => {
          statuses.reload();
          verification.reload();
        }}
      >
        {verification.data?.verification ? (
          <p>
            {verification.data.verification.current
              ? "Human verification is current."
              : verification.data.verification.lapsed
                ? "Human verification has expired."
                : "The page changed since human verification."}
            {verification.data.verification.expires_at
              ? ` Expires ${new Date(verification.data.verification.expires_at).toLocaleString()}.`
              : ""}
          </p>
        ) : (
          <p>No human verification recorded.</p>
        )}
        {canEdit ? (
          <>
            <label>
              Set page status
              <select
                value=""
                onChange={(event) => {
                  key.current = operationKey();
                  setSelected(event.target.value);
                }}
              >
                <option value="" disabled>
                  Choose a status
                </option>
                {statuses.data?.items
                  .filter((item) => !item.retiredAt && (!verificationOnly || item.requiresVerification))
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                      {item.requiresVerification ? " · human verification" : ""}
                    </option>
                  ))}
                <option value="__clear">Clear status</option>
              </select>
            </label>
            {statuses.data?.items.length === 0 ? (
              <p>Workspace owners can create statuses in Settings.</p>
            ) : null}
          </>
        ) : null}
      </RequestState>
      {!verificationOnly && canEdit && member.role==='owner'?<button onClick={()=>setCustom(true)}>Create a custom status</button>:null}
      {custom?<ActionDialog title="Create custom page status" action="Create and set status" onClose={()=>setCustom(false)} onSubmit={async data=>{const statusKey=crypto.randomUUID();await mutate('/api/status',{operationKey:operationKey(),key:statusKey,label:String(data.get('label')),color:String(data.get('color')),requiresVerification:false});await mutate(`/api/status/page/${pageId}`,{operationKey:operationKey(),expectedRevisionId:revision,statusKey});await statuses.reload();await onSaved();}}><label>Custom status label<input name="label" maxLength={20} required/></label><label>Status colour<input name="color" type="color" defaultValue="#54735b"/></label></ActionDialog>:null}
      {selected ? (
        <ActionDialog
          title={
            selectedStatus?.requiresVerification
              ? "Verify this exact revision"
              : "Change page status"
          }
          action={
            selectedStatus?.requiresVerification
              ? "I reviewed this revision"
              : "Set status"
          }
          onClose={() => setSelected(null)}
          onSubmit={async (data) => {
            await mutate(`/api/status/page/${pageId}`, {
              operationKey: key.current,
              expectedRevisionId: revision,
              statusKey: selected === "__clear" ? null : selected,
              ...(selectedStatus?.requiresVerification
                ? {
                    attestRevisionId: workingRevisionId,
                    expiresAt: data.get("expires")
                      ? new Date(String(data.get("expires"))).toISOString()
                      : null,
                  }
                : {}),
            });
            await verification.reload();
            await onSaved();
          }}
        >
          {selectedStatus?.requiresVerification ? (
            <>
              <p>
                This is your human attestation that you reviewed the currently
                opened revision. An automated check cannot provide it.
              </p>
              <label>
                Expires at (optional)
                <input name="expires" type="datetime-local" />
              </label>
            </>
          ) : (
            <p>
              {selected === "__clear"
                ? "Remove the current status."
                : `Set the status to ${selectedStatus?.label}.`}
            </p>
          )}
        </ActionDialog>
      ) : null}
    </section>
  );
}
