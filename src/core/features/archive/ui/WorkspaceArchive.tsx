import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { ActionDialog } from "../../../app/ui/ActionDialog";
interface Archived {
  id: string;
  containerId:string;
  title: string;
  revisionId: string;
  archivedAt: string | null;
  trashedAt: string | null;
  reason: string | null;
}
export function WorkspaceArchive({containerId}:{containerId?:string}={}) {
  const resource = useResource<{ items: Archived[] }>("/api/archive");
  const [tab, setTab] = useState(containerId?"trash":"archive");
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
  return (
    <>
      <header className="topbar">Archive & trash</header>
      <section className="main">
        <p className="eyebrow">KEEP WHAT MATTERS</p>
        <h1 className="title">Out of the way.\nStill within reach.</h1>
        <div className="editor-actions">
          <button
            type="button"
            aria-pressed={tab === "archive"}
            onClick={() => setTab("archive")}
          >
            Archive
          </button>
          <button
            type="button"
            aria-pressed={tab === "trash"}
            onClick={() => setTab("trash")}
          >
            Trash
          </button>
        </div>
        <p className="muted">
          Archived pages retain their history. Permanently deleting trash is
          irreversible.
        </p>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          <ul className="archive-list">
            {resource.data?.items
              .filter((item) =>
                (!containerId||item.containerId===containerId) && (tab === "trash" ? item.trashedAt : !item.trashedAt),
              )
              .map((item) => (
                <li key={item.id}>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.reason}</p>
                  </div>
                  <button type="button" onClick={() => void restore(item)}>
                    Restore
                  </button>
                  {item.trashedAt ? (
                    <button type="button" onClick={() => setSelected(item)}>
                      Delete permanently
                    </button>
                  ) : null}
                </li>
              ))}
          </ul>
          {resource.data?.items.filter((item) =>
            tab === "trash" ? item.trashedAt : !item.trashedAt,
          ).length === 0 ? (
            <p>Nothing here.</p>
          ) : null}
        </RequestState>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
        {selected ? (
          <ActionDialog
            title={`Permanently delete ${selected.title}?`}
            action="Delete permanently"
            onClose={() => setSelected(undefined)}
            onSubmit={async (data) => {
              if (data.get("confirm") !== selected.title)
                throw new Error("Type the exact page title to confirm.");
              await mutate(`/api/archive/${selected.id}/permanent-delete`, {
                operationKey: operationKey(),
                confirmedPageIds: [selected.id],
              });
              resource.reload();
            }}
          >
            <p>
              This removes the page’s content and revision content permanently.
              If it has children, Slate will require confirmation of the full
              list before any deletion.
            </p>
            <label>
              Type the page title
              <input name="confirm" required autoComplete="off" />
            </label>
          </ActionDialog>
        ) : null}
      </section>
    </>
  );
}
