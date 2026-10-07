import { ActionDialog } from "../../../../app/ui/ActionDialog";
import { useResource } from "../../../../client/useResource";
import type {
  ContentQueryBlockData,
  ContentQueryDefinition,
} from "../../../editor/ui/types";
export function ContentQueryDialog({
  block,
  onSave,
  onClose,
}: {
  block: ContentQueryBlockData;
  onSave: (definition: ContentQueryDefinition) => Promise<void>;
  onClose: () => void;
}) {
  const spaces = useResource<{ items: { id: string; name: string }[] }>(
      "/api/containers",
    ),
    pages = useResource<{ items: { id: string; title: string }[] }>(
      "/api/pages",
    ),
    members = useResource<{ items: { id: string; displayName: string }[] }>(
      "/api/members",
    ),
    statuses = useResource<{ items: { key: string; label: string }[] }>(
      "/api/status",
    );
  return (
    <ActionDialog
      title="Edit content query"
      action="Save query"
      onClose={onClose}
      onSubmit={async (data) => {
        const definition: ContentQueryDefinition = {};
        for (const key of [
          "container",
          "ancestor",
          "pageType",
          "status",
          "contributor",
          "orderBy",
        ] as const) {
          const value = String(data.get(key) ?? "");
          if (value) definition[key] = value;
        }
        const from = String(data.get("from") ?? ""),
          to = String(data.get("to") ?? "");
        if (from || to) {
          if (!from || !to || from > to)
            throw new Error("Choose a complete, ordered date range.");
          definition.dateRange = `${from}/${to}`;
        }
        definition.limit = Number(data.get("limit"));
        await onSave(definition);
      }}
    >
      <label>
        Space
        <select
          aria-label="Space"
          name="container"
          defaultValue={block.definition.container ?? ""}
        >
          <option value="">All readable spaces</option>
          {spaces.data?.items.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Under page
        <select
          aria-label="Under page"
          name="ancestor"
          defaultValue={block.definition.ancestor ?? ""}
        >
          <option value="">Any parent</option>
          {pages.data?.items.map((p) => (
            <option value={p.id} key={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Page type
        <select
          aria-label="Page type"
          name="pageType"
          defaultValue={block.definition.pageType ?? ""}
        >
          <option value="">All types</option>
          <option value="page">Page</option>
          <option value="record">Database record</option>
        </select>
      </label>
      <label>
        Status
        <select
          aria-label="Status"
          name="status"
          defaultValue={block.definition.status ?? ""}
        >
          <option value="">Any status</option>
          {statuses.data?.items.map((p) => (
            <option value={p.key} key={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Contributor
        <select
          aria-label="Contributor"
          name="contributor"
          defaultValue={block.definition.contributor ?? ""}
        >
          <option value="">Any contributor</option>
          {members.data?.items.map((p) => (
            <option value={p.id} key={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Updated from
        <input
          type="date"
          name="from"
          defaultValue={block.definition.dateRange?.split("/")[0]}
        />
      </label>
      <label>
        Updated through
        <input
          type="date"
          name="to"
          defaultValue={block.definition.dateRange?.split("/")[1]}
        />
      </label>
      <label>
        Order
        <select
          aria-label="Order"
          name="orderBy"
          defaultValue={block.definition.orderBy ?? "updated"}
        >
          <option value="updated">Recently updated</option>
          <option value="title">Title</option>
        </select>
      </label>
      <label>
        Maximum results
        <input
          type="number"
          min={1}
          max={100}
          name="limit"
          defaultValue={block.definition.limit ?? 20}
          required
        />
      </label>
    </ActionDialog>
  );
}
