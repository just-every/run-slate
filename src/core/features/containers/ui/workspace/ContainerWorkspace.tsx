import { ContainerDetail } from "./ContainerDetail";
import { useSearch } from "@tanstack/react-router";
import { useEffect,useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { TopBar } from "../../../../app/ui/header/TopBar";
import { PageTitle } from "../../../../app/ui/header/PageTitle";
export type Container = {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  key: string | null;
  visibility: string;
  revisionId: string;
  guestAccess: string;
  publicLinkAccess: string;
  anonymousAccess: string;
  archivedAt: string | null;
  memberCount: number;
  permissions: { canManage: boolean };
};
function visibilityLabel(value: string) { return ({default:"Workspace access",open:"Open to the team",closed:"Members only",private:"Private",personal:"Personal"} as Record<string,string>)[value] ?? value; }
/** `embedded` shows only the spaces panel inside Settings, which supplies the top bar and title. */
export function ContainerWorkspace({containerId,embedded}:{containerId?:string;embedded?:boolean}={}) {
  const [archived, setArchived] = useState(false);
  // The router parses the query on the server and in the browser alike, so a first render never reads `window`.
  const search = useSearch({ strict: false }) as { container?: unknown; create?: unknown };
  const requestedContainer = containerId ?? (search.container == null ? null : String(search.container));
  const requestedCreate = String(search.create) === "true";
  const [selected, setSelected] = useState<string | null>(requestedContainer);
  const [create, setCreate] = useState(requestedCreate);
  const [visibility,setVisibility]=useState("");
  const [membership,setMembership]=useState(false);
  const [personal,setPersonal]=useState(false);
  const navigation=useResource<{containers:{id:string}[]}>("/api/navigation");
  useEffect(()=>{setSelected(requestedContainer);setCreate(requestedCreate);},[requestedContainer,requestedCreate]);
  const key = useRef(operationKey());
  const spaces = useResource<{ items: Container[] }>(
    `/api/containers?archived=${archived}`,
  );
  const panel = (
    <section className="settings-panel spaces-workspace">
      {embedded ? <h2>Spaces</h2> : null}
      <div className="action-row">
        <button className="primary-button"
          onClick={() => {
            key.current = operationKey();
            setCreate(true);
          }}
        >
          Create space
        </button>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => {
              setArchived(event.target.checked);
              setSelected(null);
            }}
          />
          Show archived spaces
        </label>
      </div>
      <div className="action-row"><label>Visibility<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="">All</option>{["default","open","closed","private","personal"].map(v=><option key={v} value={v}>{visibilityLabel(v)}</option>)}</select></label><label><input type="checkbox" checked={membership} onChange={e=>setMembership(e.target.checked)}/>My memberships</label><label><input type="checkbox" checked={personal} onChange={e=>setPersonal(e.target.checked)}/>Personal spaces</label></div>
      <RequestState
        loading={spaces.loading}
        error={spaces.error}
        retry={spaces.reload}
      >
        <ul className="settings-list">
          {spaces.data?.items.filter(s=>(!visibility||s.visibility===visibility)&&(!personal||s.visibility==="personal")&&(!membership||navigation.data?.containers.some(c=>c.id===s.id))).map((space) => (
            <li key={space.id}>
              <button className="space-choice" aria-pressed={selected === space.id} onClick={() => setSelected(space.id)}>
                <strong>
                  {space.icon} {space.name}
                </strong>
                <p>
                  {visibilityLabel(space.visibility)} · {space.memberCount} {space.memberCount === 1 ? "member" : "members"}{space.description ? ` · ${space.description}` : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </RequestState>
      {selected ? (
        <ContainerDetail key={selected} id={selected} updated={spaces.reload} />
      ) : null}
      {create ? (
        <ActionDialog
          title="Create a space"
          action="Create space"
          onClose={() => setCreate(false)}
          onSubmit={async (data) => {
            const result = await mutate<{ value: { id: string } }>(
              "/api/containers",
              {
                operationKey: key.current,
                name: String(data.get("name")),
                description: String(data.get("description")),
                icon: String(data.get("icon")) || null,
                visibility: String(data.get("visibility")),
                key: String(data.get("key")) || null,
              },
            );
            spaces.reload();
            setSelected(result.value.id);
          }}
        >
          <label>Purpose<select onChange={e=>{const form=e.currentTarget.form;const visibility=form?.elements.namedItem("visibility") as unknown as HTMLSelectElement;if(visibility)visibility.value=e.target.value;}}><option value="private">Private project</option><option value="open">Open team knowledge</option><option value="closed">Restricted team</option></select></label>
          <label>Short key<input name="key"/></label>
          <label>
            Name
            <input name="name" required maxLength={200} />
          </label>
          <label>
            Description
            <textarea name="description" />
          </label>
          <label>
            Icon
            <input name="icon" placeholder="An emoji" />
          </label>
          <label>
            Visibility
            <select name="visibility" defaultValue="private">
              <option value="private">Private</option>
              <option value="closed">Closed</option>
              <option value="open">Open</option>
              <option value="default">Default workspace access</option>
            </select>
          </label>
        </ActionDialog>
      ) : null}
    </section>
  );
  if (embedded) return panel;
  return (
    <>
      <TopBar trail={[{ label: "Spaces" }]} />
      <section className="main">
        <PageTitle>Spaces</PageTitle>
        {panel}
      </section>
    </>
  );
}
