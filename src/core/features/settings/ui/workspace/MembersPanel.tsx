import {PeopleDirectory} from './PeopleDirectory';
import { MailDeliveryPanel } from "./MailDeliveryPanel";
import { LocalInvitationNotice } from "./LocalInvitationNotice";
import { GuestsPanel } from './GuestsPanel';
import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { useWorkspace } from "../../../../app/ui/WorkspaceContext";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { MemberView, GroupView } from "../../../../shared/api/workspace";
export function MembersPanel() {
  const { member, localDevelopment } = useWorkspace();
  const owner = member.role === "owner";
  const members = useResource<{ items: MemberView[] }>("/api/members");
  const groups = useResource<{ items: GroupView[] }>(owner?"/api/groups":null);
  const [directory,setDirectory]=useState(false);
  const [invite, setInvite] = useState(false);
  const [sent, setSent] = useState(false);
  const [remove, setRemove] = useState<MemberView>();
  const [group, setGroup] = useState<GroupView | "new">();
  return (
    <section className="settings-panel">
      <h2>Good work is shared.</h2>
      <button type="button" onClick={()=>setDirectory(!directory)}>{directory?"Close people directory":"Browse people and expertise"}</button>
      {directory?<PeopleDirectory/>:null}
      {localDevelopment ? <LocalInvitationNotice /> : null}
      <button onClick={() => setInvite(true)}>Invite a member</button>
      {sent ? (
        <p role="status">
          {localDevelopment
            ? "Invitation request accepted locally. No email was sent. The recipient cannot sign in from this request; send a new invitation from a hosted installation to give them access."
            : "Invitation request accepted. Delivery follows the workspace’s mail configuration."}
        </p>
      ) : null}
      <RequestState
        loading={members.loading}
        error={members.error}
        retry={members.reload}
      >
        <ul className="settings-list">
          {members.data?.items.map((person) => (
            <li key={person.id}>
              <div>
                <strong>{person.displayName}</strong>
                <p className="muted">
                  {person.email} · {person.role}
                </p>
              </div>
              {owner && person.id !== member.id ? (
                <button onClick={() => setRemove(person)}>Remove</button>
              ) : null}
            </li>
          ))}
        </ul>
      </RequestState>
      {owner ? <GuestsPanel localDevelopment={localDevelopment}/> : null}
      {localDevelopment||!owner ? null : <MailDeliveryPanel/>}
      <h3>Groups</h3>
      {owner ? (
        <button onClick={() => setGroup("new")}>Create group</button>
      ) : null}
      <RequestState
        loading={groups.loading}
        error={groups.error}
        retry={groups.reload}
      >
        <ul className="settings-list">
          {groups.data?.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <p>{item.memberIds.length} {item.memberIds.length === 1 ? "member" : "members"}</p>
              </div>
              {owner ? (
                <button onClick={() => setGroup(item)}>Edit</button>
              ) : null}
            </li>
          ))}
        </ul>
      </RequestState>
      {invite ? (
        <ActionDialog
          title="Invite a member"
          action={localDevelopment ? "Record invitation locally" : "Send invitation"}
          onClose={() => setInvite(false)}
          onSubmit={async (data) => {
            await mutate("/api/invitations", {
              operationKey: operationKey(),
              email: String(data.get("email")),
              kind: "member",
            });
            setSent(true);
          }}
        >
          {localDevelopment ? <LocalInvitationNotice /> : null}
          <label>
            Email
            <input type="email" name="email" required />
          </label>
          <p>
            Members can access pages shared with the workspace. Invite guests to
            individual pages through Share.
          </p>
        </ActionDialog>
      ) : null}
      {remove ? (
        <ActionDialog
          title={`Remove ${remove.displayName}?`}
          action="Remove member"
          onClose={() => setRemove(undefined)}
          onSubmit={async () => {
            await mutate("/api/members/remove", {
              operationKey: operationKey(),
              memberId: remove.id,
            });
            members.reload();
            groups.reload();
          }}
        >
          <p>
            This revokes their workspace membership. Authored content and
            history remain.
          </p>
        </ActionDialog>
      ) : null}
      {group ? (
        <ActionDialog
          title={group === "new" ? "Create group" : "Edit group"}
          action="Save group"
          onClose={() => setGroup(undefined)}
          onSubmit={async (form) => {
            await mutate("/api/groups", {
              operationKey: operationKey(),
              ...(group === "new"
                ? {}
                : { id: group.id, expectedRevisionId: group.revisionId }),
              name: String(form.get("name")),
              memberIds: form.getAll("memberId").map(String),
            });
            groups.reload();
          }}
        >
          <label>
            Name
            <input
              name="name"
              required
              defaultValue={group === "new" ? "" : group.name}
            />
          </label>
          <fieldset>
            <legend>Members</legend>
            {members.data?.items.map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  name="memberId"
                  value={person.id}
                  defaultChecked={
                    group !== "new" && group.memberIds.includes(person.id)
                  }
                />
                {person.displayName}
              </label>
            ))}
          </fieldset>
        </ActionDialog>
      ) : null}
    </section>
  );
}
