import {ReadableExportDialog} from "../../../exports/ui/ReadableExportDialog";
import {CreatePageDialog} from "../../../../app/ui/CreatePageDialog";
import {FavouriteControl} from "../../../navigation/ui/workspace/FavouriteControl";
import {ContainerBulk} from "./ContainerBulk";
import {WorkspaceArchive} from "../../../archive/ui/WorkspaceArchive";
import {TemplatesWorkspace} from "../../../templates/ui/workspace/TemplatesWorkspace";
import { useEffect,useRef, useState } from "react";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { PageTree, type TreePage } from "../../../../app/ui/PageTree";
import { AnalyticsPanel } from "../../../analytics/ui/workspace/AnalyticsPanel";
import { ContainerSettings } from "./ContainerSettings";
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
export function ContainerWorkspace({containerId}:{containerId?:string}={}) {
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<string | null>(()=>containerId ?? new URLSearchParams(window.location.search).get("container"));
  const [create, setCreate] = useState(()=>new URLSearchParams(window.location.search).get("create")==="true");
  const [visibility,setVisibility]=useState("");
  const [membership,setMembership]=useState(false);
  const [personal,setPersonal]=useState(false);
  const navigation=useResource<{containers:{id:string}[]}>("/api/navigation");
  useEffect(()=>{setSelected(containerId??new URLSearchParams(window.location.search).get("container"));setCreate(new URLSearchParams(window.location.search).get("create")==="true");},[containerId]);
  const key = useRef(operationKey());
  const spaces = useResource<{ items: Container[] }>(
    `/api/containers?archived=${archived}`,
  );
  return (
    <section className="settings-panel">
      <p className="eyebrow">ROOM FOR YOUR WORK</p>
      <h1>Spaces.</h1>
      <div className="action-row">
        <button
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
      <div className="action-row"><label>Visibility<select value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="">All</option>{["default","open","closed","private","personal"].map(v=><option key={v}>{v}</option>)}</select></label><label><input type="checkbox" checked={membership} onChange={e=>setMembership(e.target.checked)}/>My memberships</label><label><input type="checkbox" checked={personal} onChange={e=>setPersonal(e.target.checked)}/>Personal spaces</label></div>
      <RequestState
        loading={spaces.loading}
        error={spaces.error}
        retry={spaces.reload}
      >
        <ul className="settings-list">
          {spaces.data?.items.filter(s=>(!visibility||s.visibility===visibility)&&(!personal||s.visibility==="personal")&&(!membership||navigation.data?.containers.some(c=>c.id===s.id))).map((space) => (
            <li key={space.id}>
              <button onClick={() => setSelected(space.id)}>
                <strong>
                  {space.icon} {space.name}
                </strong>
                <p>
                  {space.visibility} · {space.memberCount} members · {space.description}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </RequestState>
      {selected ? (
        <ContainerDetail id={selected} updated={spaces.reload} />
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
}
function ContainerDetail({ id, updated }: { id: string; updated: () => void }) {
  const resource = useResource<Container>(`/api/containers/${id}`);
  const pages = useResource<{ items: TreePage[] }>(
    `/api/pages?containerId=${id}`,
  );
  const [query, setQuery] = useState("");
  const [createPage,setCreatePage]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [tab,setTab]=useState("content");
  const available = pages.data?.items ?? [];
  const matched = new Set(
    available
      .filter((page) => page.title.toLowerCase().includes(query.toLowerCase()))
      .map((page) => page.id),
  );
  for (const page of available) {
    if (!matched.has(page.id)) continue;
    let parent = page.parentPageId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      matched.add(parent);
      parent = available.find((item) => item.id === parent)?.parentPageId;
    }
  }
  return (
    <RequestState
      loading={resource.loading}
      error={resource.error}
      retry={resource.reload}
    >
      {resource.data ? (
        <section>
          <h3>{resource.data.name}</h3><FavouriteControl kind="container" id={id}/><button onClick={()=>setExporting(true)}>Export space</button>{exporting?<ReadableExportDialog id={id} container onClose={()=>setExporting(false)}/>:null}
          <nav aria-label="Space navigation">{['content','settings','templates','trash','bulk'].map(value=><button aria-pressed={tab===value} key={value} onClick={()=>setTab(value)}>{value}</button>)}</nav>
          <a href={`/app/search?containerId=${id}`}>Search this space</a>
          {tab==='templates'?<TemplatesWorkspace defaultContainerId={id}/>:tab==='trash'?<WorkspaceArchive containerId={id}/>:tab==='bulk'?<ContainerBulk pages={available} onSaved={pages.reload}/>:null}
          {tab==='content'?<>
          <p>{resource.data.description}</p>
          <label>
            Filter page titles
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {query?<button onClick={()=>setQuery("")}>Clear page filter</button>:null}<PageTree pages={available.filter((page) => matched.has(page.id))} />
          <button onClick={()=>setCreatePage(true)}>Create page in this space</button>
          {createPage?<CreatePageDialog defaultContainerId={id} onClose={()=>setCreatePage(false)} onCreated={pageId=>window.location.assign(`/app/pages/${pageId}`)}/>:null}
          </>:null}
          {tab==='settings'?<ContainerSettings
            container={resource.data}
            onSaved={async () => {
              await resource.reload();
              updated();
            }}
          />:null}
          <details>
            <summary>Readership</summary>
            <AnalyticsPanel containerId={id} />
          </details>
        </section>
      ) : null}
    </RequestState>
  );
}
