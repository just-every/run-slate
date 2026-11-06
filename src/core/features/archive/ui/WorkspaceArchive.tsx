import { useEffect, useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage, ApiError } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { ActionDialog } from "../../../app/ui/ActionDialog";
import { TopBar } from "../../../app/ui/header/TopBar";
import { PageTitle } from "../../../app/ui/header/PageTitle";
interface Archived {
  id: string;
  containerId:string;
  title: string;
  revisionId: string;
  archivedAt: string | null;
  trashedAt: string | null;
  reason: string | null;
  occurredAt: string | null;
  actorMemberId: string | null;
  actorDisplayName: string | null;
  priorContainerId: string | null;
  priorContainerName: string | null;
  priorParentId: string | null;
  priorParentTitle: string | null;
  priorPosition: string | null;
  priorOrder: number | null;
}
/** `embedded` puts the list inside a space's Trash tab, which already has its own top bar and title. */
export function WorkspaceArchive({containerId,embedded}:{containerId?:string;embedded?:boolean}={}) {
  const resource = useResource<{ items: Archived[] }>("/api/archive");
  const [tab, setTab] = useState(containerId?"trash":"archive");
  useEffect(() => { if (window.location.hash === "#trash") setTab("trash"); }, []);
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("");
  const [space, setSpace] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [selected, setSelected] = useState<Archived>();
  const [error, setError] = useState<unknown>();
  async function restore(item: Archived) {
    try {
      await mutate(`/api/archive/${item.id}`, {
        operationKey: operationKey(),
        expectedRevisionId: item.revisionId,
        action: "restore",
      });
      resource.reload();
    } catch (cause) {
      setError(cause);
    }
  }
  const items = (resource.data?.items ?? []).filter(item =>
    (!containerId || item.containerId === containerId) && (tab === "trash" ? item.trashedAt : !item.trashedAt));
  const shown = tab === "trash" ? items.filter(item => {
    const day = item.trashedAt?.slice(0, 10) ?? "";
    const text = [item.title, item.actorDisplayName, item.priorContainerName, item.priorParentTitle].join(" ").toLocaleLowerCase();
    return text.includes(query.trim().toLocaleLowerCase()) && (!actor || item.actorMemberId === actor)
      && (!space || item.priorContainerId === space) && (!after || day >= after) && (!before || day <= before);
  }) : items;
  const actors = [...new Map(items.map(item => [item.actorMemberId, item.actorDisplayName])).entries()].filter(([id]) => id);
  const spaces = [...new Map(items.filter(item => item.priorContainerName).map(item => [item.priorContainerId, item.priorContainerName])).entries()];
  function clearFilters() { setQuery(""); setActor(""); setSpace(""); setAfter(""); setBefore(""); }
  const tabs = (
    <div className="tabs" role="group" aria-label="Archive and trash">
      <button type="button" aria-pressed={tab === "archive"} onClick={() => setTab("archive")}>
        Archive
      </button>
      <button type="button" aria-pressed={tab === "trash"} onClick={() => setTab("trash")}>
        Trash
      </button>
    </div>
  );
  const body = <>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {tab === "trash" ? <div className="trash-filters">
            <label>Search trash<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <label>Deleted by<select aria-label="Deleted by" value={actor} onChange={event => setActor(event.target.value)}>
              <option value="">Anyone</option>{actors.map(([id, name]) => <option key={id} value={id!}>{name ?? "Former member"}</option>)}
            </select></label>
            {!containerId ? <label>Prior space<select aria-label="Prior space" value={space} onChange={event => setSpace(event.target.value)}>
              <option value="">All spaces</option>{spaces.map(([id, name]) => <option key={id} value={id!}>{name}</option>)}
            </select></label> : null}
            <label>Deleted after<input type="date" value={after} onChange={event => setAfter(event.target.value)} /></label>
            <label>Deleted before<input type="date" value={before} onChange={event => setBefore(event.target.value)} /></label>
            <button className="secondary-button" type="button" onClick={clearFilters}>Clear filters</button>
          </div> : null}
          <ul className="archive-list">
            {shown.map((item) => (
                <li key={item.id} data-page-id={item.id}>
                  <div>
                    <h2>{item.title}</h2>
                    {item.reason ? <p>{item.reason}</p> : null}
                    <p className="muted">{item.trashedAt ? "Deleted" : "Archived"} by {item.actorDisplayName ?? "Former member"}
                      {item.occurredAt ? <> · <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time></> : null}
                    </p>
                    <p className="muted">Prior place: {item.priorContainerName ?? "Unavailable space"} → {item.priorParentId ? item.priorParentTitle ?? "Unavailable parent" : "Top level"}
                      {" · "}{item.priorOrder ? `Restore position: ${item.priorOrder}` : "Original ordering retained"}</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => void restore(item)}>
                    Restore
                  </button>
                  {item.trashedAt ? (
                    <button className="secondary-button" type="button" onClick={() => setSelected(item)}>
                      Delete permanently
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
          {shown.length === 0 ? (
            <p>{items.length ? "No trash matches these filters." : "Nothing here."}</p>
          ) : null}
        </RequestState>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
        {selected ? (
          <PermanentDeleteDialog
            key={selected.id}
            item={selected}
            onClose={() => setSelected(undefined)}
            onDeleted={resource.reload}
          />
        ) : null}
  </>;
  if (embedded) return <section className="archive-workspace">{tabs}{body}</section>;
  return (
    <>
      <TopBar trail={[{ label: "Archive & trash" }]} />
      <section className="main archive-workspace">
        <PageTitle>Archive & trash</PageTitle>
        {tabs}
        {body}
      </section>
    </>
  );
}

function PermanentDeleteDialog({item,onClose,onDeleted}:{item:Archived;onClose:()=>void;onDeleted:()=>void}) {
  const preview=useResource<{items:{id:string;title:string}[]}>(`/api/archive/${item.id}/permanent-delete-preview`);
  return <ActionDialog
    title={`Permanently delete ${item.title}?`}
    action="Delete permanently"
    onClose={onClose}
    submitDisabled={preview.loading || !preview.data || !!preview.error}
    onSubmit={async data=>{
      if(data.get("confirm")!==item.title)throw new Error("Type the exact page title to confirm.");
      const confirmedPageIds=data.getAll("pageId").map(String);
      if(!preview.data || confirmedPageIds.length!==preview.data.items.length)throw new Error("Confirm every page to be destroyed.");
      try {
        await mutate(`/api/archive/${item.id}/permanent-delete`,{operationKey:operationKey(),confirmedPageIds});
        onDeleted();
      } catch(cause) {
        if(cause instanceof ApiError && cause.code==="CONFIRM_CASCADE")preview.reload();
        throw cause;
      }
    }}
  >
    <p>This permanently removes the named pages, every revision, uploaded files and comments. For imported content, it also removes the retained source archive and import recovery history. Other native pages remain, but that import can no longer be retried or undone.</p>
    <RequestState loading={preview.loading} error={preview.error} retry={preview.reload}>
      <p>Confirm every page to be destroyed:</p>
      {preview.data?.items.map(page=><label key={page.id}>
        <input type="checkbox" name="pageId" value={page.id} required />
        {page.title}
      </label>)}
    </RequestState>
    <label>Type the page title<input name="confirm" required autoComplete="off" /></label>
  </ActionDialog>;
}
