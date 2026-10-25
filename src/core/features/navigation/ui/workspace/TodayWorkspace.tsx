import type { FollowingFeed } from "./Following";
import { DateStamp } from "../../../../app/ui/displayDate";
import { notificationText } from "../../../notifications/ui/notificationText";
import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import {PersonalHome} from "./PersonalHome";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import { mutate, operationKey } from "../../../../client/transport";
import { TopBar } from "../../../../app/ui/header/TopBar";
import { PageTitle } from "../../../../app/ui/header/PageTitle";
interface Notice {
  id: string;
  title: string | null;
  event: string;
  actor: { displayName: string } | null;
  href: string;
  createdAt: string;
  readAt: string | null;
}
interface Today {
  decisions: Notice[];
  contradictions: Notice[];
  notices: Notice[];
  outcomes: { day: string; count: number; items: Notice[] }[];
  unreadCount: number;
}
export function TodayWorkspace() {
  return useFlagshipEnabled() ? <FlagshipToday /> : <><TopBar trail={[{ label: "Today" }]} /><section className="main"><PageTitle>Your workspace</PageTitle><PersonalHome /></section></>;
}
function FlagshipToday() {
  const resource = useResource<Today>("/api/notifications/today");
  const following = useResource<FollowingFeed>("/api/navigation/following");
  const data = resource.data;
  const followedIds = new Set(following.data?.items.map(item => item.id));
  const notices = data?.notices.filter(item => !followedIds.has(item.id)) ?? [];
  const empty =
    data &&
    !data.decisions.length &&
    !data.contradictions.length &&
    !data.notices.length &&
    !data.outcomes.length;
  function rows(items: Notice[]) {
    return (
      <ul className="outcome-list">
        {items.map((item) => (
          <li key={item.id} data-event={item.event}>
            <a
              href={item.href}
              onClick={() => {
                void mutate("/api/notifications/actions", {
                  operationKey: operationKey(),
                  action: "read",
                  id: item.id,
                }).catch(() => {});
              }}
            >
              <h3>{notificationText(item)}</h3>
              
                
              <DateStamp value={item.createdAt} />
              <span className="outcome-arrow" aria-hidden="true">
                ↗
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <TopBar trail={[{ label: "Today" }]}>
        <a href="/app/inbox">
          Inbox{data?.unreadCount ? ` · ${data.unreadCount}` : ""}
        </a>
      </TopBar>
      <section className="main" data-testid="workspace-empty-state">
        <PageTitle>Today</PageTitle>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {empty ? (
            <div className="empty-start">
              <a href="/app/settings?section=portability">
                Import your knowledge
              </a>
              <p className="muted">
                Nothing needs your attention yet. Ask a question from any page
                to use its context.
              </p>
            </div>
          ) : null}
          {data?.decisions.length ? (
            <section className="today-section">
              <h2>Ready for your decision</h2>
              {rows(data.decisions)}
            </section>
          ) : null}
          {data?.contradictions.length ? (
            <section className="today-section">
              <h2>Something needs a closer look</h2>
              {rows(data.contradictions)}
            </section>
          ) : null}
          {data?.outcomes.map((group) => (
            <section className="today-section" key={group.day}>
              <h2>Completed work · {group.day}</h2>
              {rows(group.items)}
            </section>
          ))}
          {!following.loading && notices.length ? (
            <section className="today-section">
              <h2>For you</h2>
              {rows(notices)}
            </section>
          ) : null}
        </RequestState>
        <PersonalHome following={following}/>
      </section>
    </>
  );
}
