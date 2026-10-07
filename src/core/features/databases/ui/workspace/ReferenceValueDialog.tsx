import { useState } from "react";
import { useResource } from "../../../../client/useResource";
import { RequestState } from "../../../../app/ui/RequestState";
import { ActionDialog } from "../../../../app/ui/ActionDialog";
import type { FieldDto } from "../../../../client/records";
export function ReferenceValueDialog({
  databaseId,
  field,
  value,
  onSave,
  onClose,
}: {
  databaseId: string;
  field: FieldDto;
  value: unknown;
  onSave: (value: unknown) => Promise<void>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? (value as string[]) : [],
  );
  const choices = useResource<{
    items: { id: string; label: string }[];
    hasMore: boolean;
  }>(
    `/api/databases/${databaseId}/references/${field.id}?query=${encodeURIComponent(query)}`,
  );
  return (
    <ActionDialog
      title={`Choose ${field.name}`}
      action="Save selection"
      onClose={onClose}
      onSubmit={() => onSave(selected)}
    >
      <label>
        Find
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <RequestState
        loading={choices.loading}
        error={choices.error}
        retry={choices.reload}
      >
        {choices.data?.items.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, item.id]
                    : selected.filter((id) => id !== item.id),
                )
              }
            />
            {item.label}
          </label>
        ))}
        {choices.data?.hasMore ? (
          <p>Narrow your search to see more choices.</p>
        ) : null}
        {choices.data?.items.length === 0 ? (
          <p>No accessible matches.</p>
        ) : null}
      </RequestState>
      <p>
        {selected.length} selected. Existing selections outside this search are
        preserved.
      </p>
      <button type="button" onClick={() => setSelected([])}>
        Clear selection
      </button>
    </ActionDialog>
  );
}
