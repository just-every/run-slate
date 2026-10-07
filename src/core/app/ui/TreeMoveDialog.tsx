import { useState } from "react";
import { ActionDialog } from "./ActionDialog";
import { useResource } from "../../client/useResource";
import { mutate, operationKey } from "../../client/transport";
import { compareTreePages } from "./treePosition";
import type { TreePage } from "./PageTree";
export type TreeDestination = {
  containerId: string;
  parentPageId: string | null;
  beforeId?: string;
  afterId?: string;
};
export function TreeMoveDialog({
  page,
  pages,
  initial,
  onClose,
}: {
  page: TreePage;
  pages: TreePage[];
  initial?: TreeDestination;
  onClose: () => void;
}) {
  const [destination, setDestination] = useState<TreeDestination>(
    initial ?? {
      containerId: page.containerId,
      parentPageId: page.parentPageId ?? null,
    },
  );
  const [plan, setPlan] = useState<{
    changes: {
      pageId: string;
      memberId: string | null;
      audience?: 'public-link';
      before: string | null;
      after: string | null;
    }[];
    accessPreviewHash: string;
    revisionId: string;
    orderPreviewHash: string;
  } | null>(null);
  const members = useResource<{ items: { id: string; displayName: string }[] }>(
    "/api/members",
  );
  const siblings = pages
    .filter(
      (p) =>
        p.id !== page.id &&
        p.containerId === destination.containerId &&
        (p.parentPageId ?? null) === destination.parentPageId,
    )
    .sort(compareTreePages);
  const selector = destination.beforeId
    ? { beforeId: destination.beforeId }
    : destination.afterId
      ? { afterId: destination.afterId }
      : { atEnd: true };
  return (
    <ActionDialog
      title={plan ? "Review tree move" : "Move in tree"}
      action={plan ? "Confirm tree move" : "Review access changes"}
      onClose={onClose}
      onSubmit={async () => {
        if (!plan) {
          const fresh = await (
            await import("../../client/content")
          ).contentApi.document(page.id);
          const preview = await mutate<{
            changes: {
              pageId: string;
              memberId: string | null;
      audience?: 'public-link';
              before: string | null;
              after: string | null;
            }[];
            accessPreviewHash: string;
            orderPreviewHash: string;
          }>(`/api/pages/${page.id}/move-preview`, {
            containerId: destination.containerId,
            parentPageId: destination.parentPageId,
            ...selector,
          });
          setPlan({ ...preview, revisionId: fresh.page.revisionId });
          return false;
        }
        await mutate(`/api/pages/${page.id}/move`, {
          operationKey: operationKey(),
          expectedRevisionId: plan.revisionId,
          containerId: destination.containerId,
          parentPageId: destination.parentPageId,
          ...selector,
          orderPreviewHash: plan.orderPreviewHash,
          accessPreviewHash: plan.accessPreviewHash,
        });
        window.dispatchEvent(new Event("slate:navigation-changed"));
        window.location.reload();
      }}
    >
      {plan ? (
        <>
          <p>The page and its children move together.</p>
          {plan.changes.length ? (
            <ul>
              {plan.changes.map((change, index) => (
                <li key={index}>
                  {change.audience === "public-link" ? "Signed-in public link readers" : change.memberId === null ? "Anonymous readers" : members.data?.items.find((m) => m.id === change.memberId)
                    ?.displayName ?? "Workspace member"}{" "}
                  ·{" "}
                  {pages.find((p) => p.id === change.pageId)?.title ??
                    "Child page"}
                  : {change.before ?? "No access"} →{" "}
                  {change.after ?? "No access"}
                </li>
              ))}
            </ul>
          ) : (
            <p>No member access changes were found.</p>
          )}
          <button type="button" onClick={() => setPlan(null)}>
            Choose another position
          </button>
        </>
      ) : (
        <>
          <label>
            Parent page
            <select
              aria-label="Parent page"
              value={destination.parentPageId ?? ""}
              onChange={(event) =>
                setDestination({
                  ...destination,
                  parentPageId: event.target.value || null,
                  beforeId: undefined,
                  afterId: undefined,
                })
              }
            >
              <option value="">Top level</option>
              {pages
                .filter(
                  (p) => p.containerId === page.containerId && p.id !== page.id,
                )
                .sort(compareTreePages)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Position
            <select
              aria-label="Position"
              value={
                destination.beforeId
                  ? `before:${destination.beforeId}`
                  : destination.afterId
                    ? `after:${destination.afterId}`
                    : ""
              }
              onChange={(event) =>
                setDestination({
                  ...destination,
                  beforeId: event.target.value.startsWith("before:")
                    ? event.target.value.slice(7)
                    : undefined,
                  afterId: event.target.value.startsWith("after:")
                    ? event.target.value.slice(6)
                    : undefined,
                })
              }
            >
              <option value="">After the last page</option>
              {siblings.map((p) => (
                <optgroup key={p.id} label={p.title}>
                  <option value={`before:${p.id}`}>Before {p.title}</option>
                  <option value={`after:${p.id}`}>After {p.title}</option>
                </optgroup>
              ))}
            </select>
          </label>
          <p>
            Choose a position, then review the server’s current access changes.
          </p>
        </>
      )}
    </ActionDialog>
  );
}
