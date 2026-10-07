import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import {
  mutate,
  operationKey,
  errorMessage,
} from "../../../../client/transport";
import type { DocumentView } from "../../../../client/content";
import type { MemberView, GroupView } from "../../../../shared/api/workspace";
import { RequestState } from "../../../../app/ui/RequestState";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
interface Grant {
  id: string;
  principalKind: string;
  principalId: string;
  level: string;
  expiresAt: string | null;
  revokedAt: string | null;
  principalLabel?:string;
  origin?:{kind:string;id:string|null;name:string};
  inherited?:boolean;
  status?:string;
  effective?:boolean;
  invitationId?:string;
  invitationEmail?:string;
  invitationExpiresAt?:string;

}
export function PageSharing({ document }: { document: DocumentView }) {
  const { workspace } = useWorkspace();
  const grants = useResource<{ items: Grant[]; inheritedItems?:Grant[]; effectiveItems?:Grant[];levels?:string[];container?:{id:string;name:string};restricted?:boolean }>(
    document.permissions.canShare
      ? `/api/sharing/pages/${document.page.id}`
      : null,
  );
  const members = useResource<{ items: MemberView[] }>(
    document.permissions.canShare ? "/api/members" : null,
  );
  const guests = useResource<{items:MemberView[]}>(document.permissions.canShare ? "/api/guests" : null);
  const groups = useResource<{ items: GroupView[] }>(
    document.permissions.canShare ? "/api/groups" : null,
  );
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invited,setInvited]=useState(false);
  async function save(value: Partial<Grant> & { revoke?: boolean }) {
    setPending(true);
    setError(undefined);
    try {
      await mutate("/api/sharing", {
        operationKey: operationKey(),
        targetKind: "page",
        targetId: document.page.id,
        id: value.id,
        principalKind: value.principalKind,
        principalId: value.principalId,
        level: value.level,
        expiresAt: value.expiresAt,
        revoke: value.revoke,
      });
      grants.reload();
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }
  function name(grant: Grant) {
    if(grant.principalLabel)return grant.principalLabel;
    if(grant.invitationEmail)return grant.invitationEmail;
    if (grant.principalKind === "workspace")
      return "Everyone in this workspace";
    if (grant.principalKind === "container")
      return `Everyone in ${grants.data?.container?.name ?? "this container"}`;
    return (
      members.data?.items.find((item) => item.id === grant.principalId)
        ?.displayName ??
      groups.data?.items.find((item) => item.id === grant.principalId)?.name ??
      "Unavailable principal"
    );
  }
  return (
    <section>
      <h2>Share this page</h2>
      <p className="muted">
        Access stays within this workspace unless you explicitly publish a
        public page.
      </p>
      {!document.permissions.canShare ? (
        <p>You need full access to change who can read this page.</p>
      ) : (
        <RequestState
          loading={grants.loading}
          error={grants.error}
          retry={grants.reload}
        >
          <p>Your effective access: {document.permissions.level}</p><p>{grants.data?.restricted?'Inheritance is restricted. Only direct grants apply.':'Access inherits from the parent page and space.'}</p>
          <button disabled={pending} onClick={async()=>{setPending(true);setError(undefined);try{await mutate(`/api/sharing/pages/${document.page.id}/inheritance`,{operationKey:operationKey(),expectedRevisionId:document.page.revisionId,restricted:!grants.data?.restricted},'PUT');grants.reload();window.dispatchEvent(new CustomEvent('slate:page-mutated',{detail:{pageId:document.page.id}}));}catch(error){setError(error);}finally{setPending(false);}}}>{grants.data?.restricted?'Restore inherited access':'Restrict inherited access'}</button>
          {grants.data?.inheritedItems?.length ? <section><h3>Inherited access</h3><ul>{grants.data.inheritedItems.map(grant=><li key={grant.id}>{name(grant)} · {grant.level} · {grant.status} · From {grant.origin?.name}</li>)}</ul></section>:null}
          <ul className="grant-list">
            {grants.data?.items.map((grant) => (
              <li key={grant.id}>
                <span>{name(grant)}{grant.invitationId ? ` · ${grant.status??"Pending"} invitation` : ""}{grant.expiresAt ? ` · ${new Date(grant.expiresAt)<new Date()?"Expired":"Expires"} ${new Date(grant.expiresAt).toLocaleString()}` : ""}</span>
                {grant.revokedAt ? (
                  <span>Revoked {!grant.invitationId?<button disabled={pending} onClick={()=>void save({...grant,expiresAt:null})}>Regrant access</button>:null}</span>
                ) : (
                  <>
                    <select
                      aria-label={`Access for ${name(grant)}`}
                      value={grant.level}
                      disabled={pending || !!grant.invitationId}
                      onChange={(event) =>
                        void save({ ...grant, level: event.target.value })
                      }
                    >
                      {!grants.data?.levels?.includes(grant.level)?<option value={grant.level} disabled>{grant.level} (stored)</option>:null}
                      {(grants.data?.levels ?? []).map((level) => (
                        <option key={level}>{level}</option>
                      ))}
                    </select>
                    {grant.status==='expired'&&!grant.invitationId?<button disabled={pending} onClick={()=>void save({...grant,expiresAt:null})}>Regrant access</button>:null}
                    {!grant.invitationId ? <label>Access expires<input type="datetime-local" defaultValue={grant.expiresAt?.slice(0,16)??""} onBlur={e=>{const expiresAt=e.target.value?new Date(e.target.value).toISOString():null;if(expiresAt!==grant.expiresAt)void save({...grant,expiresAt});}}/></label>:null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void save({ ...grant, revoke: true })}
                    >
                      Remove access
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="detail-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const [principalKind, principalId] = String(
                data.get("principal"),
              ).split(":");
              void save({
                principalKind,
                principalId,
                level: String(data.get("level")),
                expiresAt:data.get("expiresAt") ? new Date(String(data.get("expiresAt"))).toISOString():null,
              });
            }}
          >
            <label>
              Invite someone
              <select name="principal" required defaultValue="">
                <option value="" disabled>
                  Choose a person or group
                </option>
                {[...(members.data?.items??[]),...(guests.data?.items??[])].map((member) => (
                  <option key={member.id} value={`member:${member.id}`}>
                    {member.displayName}
                  </option>
                ))}
                {groups.data?.items.map((group) => (
                  <option key={group.id} value={`group:${group.id}`}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Access
              <select name="level" defaultValue="view">
                {(grants.data?.levels ?? []).map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            <label>Access expires (optional)<input name="expiresAt" type="datetime-local"/></label>
            <button className="primary-button" type="submit" disabled={pending}>
              Grant access
            </button>
          </form>
          <details><summary>Invite by email</summary><form className="detail-form" onSubmit={async event=>{event.preventDefault();const data=new FormData(event.currentTarget);setPending(true);setError(undefined);try{await mutate("/api/invitations",{operationKey:operationKey(),email:String(data.get("email")),kind:"guest",pageId:document.page.id,level:String(data.get("level")),expiresAt:data.get("expires")?new Date(String(data.get("expires"))).toISOString():null});setInvited(true);grants.reload();}catch(error){setError(error);}finally{setPending(false);}}}><label>Email address<input name="email" type="email" required/></label><label>Invitation access<select name="level">{grants.data?.levels?.map(level=><option key={level}>{level}</option>)}</select></label><label>Guest access expires<input type="datetime-local" name="expires"/></label><p>Sending creates a pending invitation. Access begins only when it is accepted; the invitation expires after 24 hours.</p><button disabled={pending}>Send invitation</button>{invited?<p role="status">Invitation requested. Pending access is shown above.</p>:null}</form></details>
          {document.page.lifecycle !== "draft" &&
          document.page.lifecycle !== "scheduled" &&
          workspace.data ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void save({
                  principalKind:
                    document.policyProfile["page.access.v1"] ===
                    "workspace-general"
                      ? "workspace"
                      : "container",
                  principalId:
                    document.policyProfile["page.access.v1"] ===
                    "workspace-general"
                      ? workspace.data!.id
                      : document.page.containerId,
                  level: "view",
                })
              }
            >
              Allow general read access
            </button>
          ) : (
            <p>Private drafts have no general access.</p>
          )}
        </RequestState>
      )}
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            .writeText(window.location.href)
            .then(() => setCopied(true))
            .catch(setError);
        }}
      >
        {copied ? "Link copied" : "Copy page link"}
      </button>
      {error ? <p role="alert">{errorMessage(error)}</p> : null}
    </section>
  );
}
