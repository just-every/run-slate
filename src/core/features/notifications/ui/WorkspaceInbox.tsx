import { Fragment, useState } from "react";
import { useResource } from "../../../client/useResource";
import { mutate, operationKey, errorMessage } from "../../../client/transport";
import { RequestState } from "../../../app/ui/RequestState";
import { TopBar } from "../../../app/ui/header/TopBar";
import { PageTitle } from "../../../app/ui/header/PageTitle";
import { useWorkspace } from "../../../app/ui/WorkspaceContext";
import { displayDate } from "../../../app/ui/displayDate";
interface Notice {
  id: string;
  title: string | null;
  event: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  detail?: { outcome?: string; verificationRules?: { unverified: number; flagged: number; pages: { id: string; title: string; change: string }[] } };
}
/** STAT-007: one coalesced notice per owner and run, counts and titles only. */
function rulesSummary(rules: { unverified: number; flagged: number }) {
  const parts = [rules.unverified ? `unverified ${rules.unverified}` : "", rules.flagged ? `flagged ${rules.flagged}` : ""].filter(Boolean);
  return `Verification rules ${parts.join(" and ")} ${rules.unverified + rules.flagged === 1 ? "page" : "pages"} you own`;
}
export function WorkspaceInbox() {
  const { localDevelopment } = useWorkspace();
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
        <div className="control-row page-rule inbox-controls">
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
            {resource.data?.items.map((item, index, items) => (
              <Fragment key={item.id}>
              {index === 0 || items[index - 1].createdAt.slice(0, 10) !== item.createdAt.slice(0, 10) ? <li className="inbox-period"><h2 className="section-label"><span>{new Date(`${item.createdAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" })}</span></h2></li> : null}
              <li>
                <a href={item.href} onClick={event => {event.preventDefault();void mutate("/api/notifications/actions",{operationKey:operationKey(),action:"read",id:item.id}).then(()=>window.location.assign(item.href)).catch(setError);}}>
                  <span className="outcome-kind">
                    {item.event.replaceAll("-", " ")}
                    {!item.readAt ? " · Unread" : ""}
                  </span>
                  <h3>{item.title ?? (item.detail?.verificationRules ? rulesSummary(item.detail.verificationRules) : "Workspace update")}</h3>
                  {item.detail?.verificationRules ? <p>{item.detail.verificationRules.pages.map(page => `${page.title} (${page.change})`).join(", ")}</p> : null}
                  {localDevelopment && item.detail?.outcome ? <p>{item.detail.outcome}</p> : null}
                  <time dateTime={item.createdAt}>{displayDate(item.createdAt, true)}</time>
                </a>
              </li>
              </Fragment>
            ))}
          </ul>
          {resource.data?.items.length === 0 ? (
            <p>You’re all caught up.</p>
          ) : null}
          {resource.data?.nextCursor ? (
            <div className="list-paging"><button
              type="button"
              className="text-button"
              onClick={() => setCursor(resource.data!.nextCursor)}
            >
              Older notifications →
            </button></div>
          ) : null}
        </RequestState>
        {error ? <p role="alert">{errorMessage(error)}</p> : null}
      </section>
    </>
  );
}
