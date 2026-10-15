import { Database } from "lucide-react";
import { useLocation } from "@tanstack/react-router";
import { PageTree, type TreePage } from "./PageTree";
import { RequestState } from "./RequestState";
import { mutate, operationKey } from "../../client/transport";
import type { Resource } from "../../client/useResource";
import type { PageResult } from "../../shared/api/common";
import type { WorkspaceSnapshot } from "./workspaceSnapshot";

type Named = { items: { id: string; name: string }[] };
export type NavigationDatabases = { items: { id: string; title: string; pageId: string; containerId: string }[] };

/** The Pages section: one disclosure row per space, with its pages and databases beneath. */
export function SpaceTrees({
  pages,
  containers,
  databases,
  navigation,
  onError,
  onNavigate,
}: {
  pages: Resource<PageResult<TreePage>>;
  containers: Resource<Named>;
  databases: Resource<NavigationDatabases>;
  navigation: Resource<WorkspaceSnapshot["navigation"]>;
  onError: (cause: unknown) => void;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const preferences = navigation.data?.preferences;
  const databasePages = new Set(databases.data?.items.map((database) => database.pageId));
  const treePages = pages.data?.items.filter((page) => !databasePages.has(page.id)) ?? [];
  const spaceIds = new Set([
    ...(pages.data?.items.map((page) => page.containerId) ?? []),
    ...(databases.data?.items.map((database) => database.containerId) ?? []),
  ]);
  function toggle(id: string) {
    if (!preferences) return;
    const collapsed = preferences.value.collapsedContainers;
    void mutate("/api/navigation/preferences", {
      operationKey: operationKey(),
      expectedRevisionId: preferences.revisionId,
      value: { ...preferences.value, collapsedContainers: collapsed.includes(id) ? collapsed.filter((value) => value !== id) : [...collapsed, id] },
    }, "PUT").then(navigation.reload).catch(onError);
  }
  return (
    <nav className="page-links" aria-label="Pages" onClick={onNavigate}>
      <RequestState loading={pages.loading} error={pages.error} retry={pages.reload}>
        {[...spaceIds].map((id) => {
          const container = containers.data?.items.find((item) => item.id === id);
          return (
            <details key={id} className="space-group" open={!preferences?.value.collapsedContainers.includes(id)}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  toggle(id);
                }}
              >
                {container ? `Space · ${container.name}` : `Shared with me · ${pages.data?.items.find((page) => page.containerId === id)?.containerLabel ?? "Unavailable space"}`}
              </summary>
              <PageTree pages={treePages.filter((page) => page.containerId === id)} activePath={pathname} />
              <ul className="page-tree database-links">
                {databases.data?.items.filter((database) => database.containerId === id).map((database) => (
                  <li key={database.id}>
                    <div className="tree-row">
                      <span className="tree-spacer" />
                      <a className="navlink" href={`/app/databases/${database.id}`} aria-current={pathname === `/app/databases/${database.id}` ? "page" : undefined}>
                        <Database aria-hidden="true" />
                        <span>{database.title}</span>
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
        {pages.data?.items.length === 0 && databases.data?.items.length === 0 ? <p className="empty-tree">Your first page starts here.</p> : null}
      </RequestState>
    </nav>
  );
}
