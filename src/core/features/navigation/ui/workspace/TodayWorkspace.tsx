import { useFlagshipEnabled } from "../../../../app/ui/LaunchProfile";
import {PersonalHome} from "./PersonalHome";
import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import { CreatePageDialog } from "../../../../app/ui/CreatePageDialog";
import { mutate, operationKey } from "../../../../client/transport";
interface Notice {
  id: string;
  title: string | null;
  event: string;
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
  return useFlagshipEnabled() ? <FlagshipToday /> : <><header className="topbar"><span>Home</span><a href="/app/inbox">Inbox</a></header><section className="main"><h1>Your workspace</h1><PersonalHome /></section></>;
}
function FlagshipToday() {
  const resource = useResource<Today>("/api/notifications/today");
  const [create, setCreate] = useState(false);
  const data = resource.data;
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
          <li key={item.id}>
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
              <span className="outcome-kind">
                {item.event.replaceAll("-", " ")}
              </span>
              <h3>{item.title ?? "Workspace update"}</h3>
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString()}
              </time>
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
      <header className="topbar">
        <span>Today</span>
        <a href="/app/inbox">
          Inbox{data?.unreadCount ? ` · ${data.unreadCount}` : ""}
        </a>
      </header>
      <section className="main" data-testid="workspace-empty-state">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1 className="title">
          {empty
            ? "A little clarity.\nRoom to begin."
            : "The work that matters today."}
        </h1>
        <p className="intro">
          {empty
            ? "Keep a thought, work through a question, or bring your team’s knowledge together."
            : "Useful outcomes and decisions that need you. The details are here when you want them."}
        </p>
        <RequestState
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {empty ? (
            <div className="empty-start">
              <button
                className="primary-button"
                type="button"
                onClick={() => setCreate(true)}
              >
                Create a page <span aria-hidden="true">↗</span>
              </button>
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
          {data?.notices.length ? (
            <section className="today-section">
              <h2>For you</h2>
              {rows(data.notices)}
            </section>
          ) : null}
        </RequestState>
        <PersonalHome/>
        {create ? (
          <CreatePageDialog
            onClose={() => setCreate(false)}
            onCreated={(id) => window.location.assign(`/app/pages/${id}`)}
          />
        ) : null}
      </section>
    </>
  );
}
