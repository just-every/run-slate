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
  const databasePages = new Map(databases.data?.items.map((database) => [database.pageId, database.id]));
  const treePages = pages.data?.items.map((page) => ({ ...page, databaseId: databasePages.get(page.id) })) ?? [];
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
      <RequestState loading={pages.loading || databases.loading} error={pages.error ?? databases.error} retry={async () => { await Promise.all([pages.reload(), databases.reload()]); }}>
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
                {container ? container.name : `Shared with me · ${pages.data?.items.find((page) => page.containerId === id)?.containerLabel ?? "Unavailable space"}`}
              </summary>
              <PageTree pages={treePages.filter((page) => page.containerId === id)} activePath={pathname} />
            </details>
          );
        })}
        {pages.data?.items.length === 0 && databases.data?.items.length === 0 ? <p className="empty-tree">Your first page starts here.</p> : null}
      </RequestState>
    </nav>
  );
}
