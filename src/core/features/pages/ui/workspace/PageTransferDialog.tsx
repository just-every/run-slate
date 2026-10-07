import { useRef, useState } from "react";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { useResource } from "../../../../client/useResource";
import { mutate, operationKey } from "../../../../client/transport";
type Plan = {
  containerId: string;
  parentPageId: string | null;
  orderPreviewHash: string;
  accessPreviewHash: string;
  changes: {
    pageId: string;
    memberId: string | null;
      audience?: 'public-link';
    before: string | null;
    after: string | null;
  }[];
};
export function PageTransferDialog({
  pageId,
  revision,
  kind,
  onClose,
  onDone,
  publicSource,
}: {
  pageId: string;
  revision?: string;
  kind: "move" | "duplicate";
  onClose: () => void;
  onDone: (id: string) => void;
  publicSource?: { host: string; slug: string };
}) {
  const spaces = useResource<{ items: { id: string; name: string }[] }>(
    "/api/containers",
  );
  const pages = useResource<{
    items: { id: string; title: string; containerId: string }[];
  }>("/api/pages");
  const members = useResource<{ items: { id: string; displayName: string }[] }>(
    "/api/members",
  );
  const [spaceQuery,setSpaceQuery]=useState("");
  const [parentQuery,setParentQuery]=useState("");
  const [destination, setDestination] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const advancing = useRef(false);
  const key = useRef(operationKey());
  if (plan)
    return (
      <ActionDialog
        title="Review changed access"
        action="Move page"
        onClose={onClose}
        onSubmit={async () => {
          await mutate(`/api/pages/${pageId}/move`, {
            operationKey: key.current,
            expectedRevisionId: revision,
            containerId: plan.containerId,
            parentPageId: plan.parentPageId,
            atEnd:true,
            orderPreviewHash:plan.orderPreviewHash,
            accessPreviewHash: plan.accessPreviewHash,
          });
          onDone(pageId);
        }}
      >
        <p>
          The page and its children will move together. Current access changes:
        </p>
        {plan.changes.length ? (
          <ul>
            {plan.changes.map((change, index) => (
              <li key={index}>
                {change.audience === "public-link" ? "Signed-in public link readers" : change.memberId === null ? "Anonymous readers" : members.data?.items.find(
                  (member) => member.id === change.memberId,
                )?.displayName ?? "Workspace member"}{" "}
                ·{" "}
                {pages.data?.items.find((page) => page.id === change.pageId)
                  ?.title ?? "Child page"}
                : {change.before ?? "No access"} → {change.after ?? "No access"}
              </li>
            ))}
          </ul>
        ) : (
          <p>No member access changes were found.</p>
        )}
        <button
          type="button"
          onClick={() => {
            advancing.current = false;
            setPlan(null);
          }}
        >
          Choose another destination
        </button>
      </ActionDialog>
    );
  return (
    <ActionDialog
      title={kind === "move" ? "Move page" : "Duplicate page"}
      action={kind === "move" ? "Review access changes" : "Create copy"}
      onClose={() => {
        if (!advancing.current) onClose();
      }}
      onSubmit={async (data) => {
        const parentPageId = String(data.get("parent")) || null;
        if (kind === "duplicate") {
          const result = await mutate<{ value: { pageId: string } }>(
            `/api/pages/${pageId}/duplicate`,
            {
              operationKey: key.current,
              containerId: destination,
              parentPageId,
              includeChildren: data.get("children") === "on",
              publicSource,
            },
          );
          onDone(result.value.pageId);
          return;
        }
        const preview = await mutate<
          Pick<Plan, "changes" | "accessPreviewHash" | "orderPreviewHash">
        >(`/api/pages/${pageId}/move-preview`, {
          containerId: destination,
          parentPageId,
          atEnd:true,
        });
        advancing.current = true;
        setPlan({
          ...preview,
          containerId: destination,
          parentPageId,
        });
        return false;
      }}
    >
      <label>Find a space<input type="search" value={spaceQuery} onChange={event=>setSpaceQuery(event.target.value)}/></label>
      <label>
        Destination space
        <select
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose a space
          </option>
          {spaces.data?.items.filter(space=>space.id===destination||space.name.toLocaleLowerCase().includes(spaceQuery.toLocaleLowerCase())).map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <label>Find a parent page<input type="search" value={parentQuery} onChange={event=>setParentQuery(event.target.value)}/></label>
      <label>
        Parent page
        <select key={destination} name="parent">
          <option value="">At the top level</option>
          {pages.data?.items
            .filter(
              (page) => page.containerId === destination && page.id !== pageId && page.title.toLocaleLowerCase().includes(parentQuery.toLocaleLowerCase()),
            )
            .map((page) => (
              <option key={page.id} value={page.id}>
                {page.title}
              </option>
            ))}
        </select>
      </label>
      {kind === "duplicate" && !publicSource ? (
        <label>
          <input type="checkbox" name="children" />
          Include child pages
        </label>
      ) : null}
      {publicSource ? (
        <p>
          This copies only the published page you were permitted to duplicate.
        </p>
      ) : null}
    </ActionDialog>
  );
}
