import { useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { TopBar } from "../../../app/ui/header/TopBar";
import { PageTitle } from "../../../app/ui/header/PageTitle";
interface Notice {
  id: string;
  title: string | null;
  event: string;
  href: string;
  createdAt: string;
  readAt: string | null;
}
export function WorkspaceInbox() {
  const [audience, setAudience] = useState("");
  const [cursor, setCursor] = useState<string>();
  const resource = useResource<{
    items: Notice[];
    unreadCount: number;
    nextCursor?: string;
  }>(
    `/api/notifications?audience=${audience}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  const [error, setError] = useState<unknown>();
  async function act(action: string, id?: string) {
    try {
      await mutate("/api/notifications/actions", {
        operationKey: operationKey(),
        action,
        id,
      });
      resource.reload();
    } catch (cause) {
      setError(cause);
    }
  }
  return (
    <>
      <TopBar trail={[{ label: "Inbox" }]} />
      <section className="main">
        <PageTitle>For your attention.</PageTitle><p className="page-lede">{resource.data?.unreadCount??0} unread notifications</p>
        <div className="editor-actions">
          <select
            aria-label="Notification audience"
            value={audience}
            onChange={(event) => {
              setAudience(event.target.value);
              setCursor(undefined);
            }}
          >
            <option value="">All notifications</option>
            <option value="direct">Direct to you</option>
            <option value="watched">Watching</option>
          </select>
          <button type="button" onClick={() => void act("read-all")}>
            Mark all read
          </button>
          <button type="button" onClick={() => void act("archive-read")}>
            Archive read
          </button>
        </div>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          <ul className="outcome-list">
            {resource.data?.items.map((item) => (
              <li key={item.id}>
                <a href={item.href} onClick={event => {event.preventDefault();void mutate("/api/notifications/actions",{operationKey:operationKey(),action:"read",id:item.id}).then(()=>window.location.assign(item.href)).catch(setError);}}>
                  <span className="outcome-kind">
                    {item.event.replaceAll("-", " ")}
                    {!item.readAt ? " · Unread" : ""}
                  </span>
                  <h3>{item.title ?? "Workspace update"}</h3>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                </a>
              </li>
            ))}
          </ul>
          {resource.data?.items.length === 0 ? (
            <p>You’re all caught up.</p>
          ) : null}
          {resource.data?.nextCursor ? (
            <button
              type="button"
              onClick={() => setCursor(resource.data!.nextCursor)}
            >
              Older notifications →
            </button>
          ) : null}
        </RequestState>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </section>
    </>
  );
}
