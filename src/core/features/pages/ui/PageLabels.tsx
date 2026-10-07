import { Plus, Tag, X } from "lucide-react";
import { useId, useState } from "react";
import { Button, cn, Input } from "../../../ui";

/**
 * `PAGE-001` — labels are short text tags, unique on the page, added and removed
 * by anyone with edit access. A duplicate is refused here rather than silently
 * dropped, so the member sees why nothing happened.
 */
export function PageLabels({
  labels,
  canEdit = false,
  onAddLabel,
  onRemoveLabel,
  onOpenLabel,
  className,
}: {
  labels: readonly string[];
  canEdit?: boolean;
  onAddLabel?: (label: string) => void;
  onRemoveLabel?: (label: string) => void;
  onOpenLabel?: (label: string) => void;
  className?: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (labels.length === 0 && !canEdit) return null;

  const submit = () => {
    const value = draft.trim();
    if (value.length === 0) return;
    if (labels.some((label) => label.toLowerCase() === value.toLowerCase())) {
      setError("That label is already on this page.");
      return;
    }
    onAddLabel?.(value);
    setDraft("");
    setError(null);
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <ul className="flex flex-wrap items-center gap-1.5">
        {labels.map((label) => (
          <li className="inline-flex items-center" key={label}>
            <span className="inline-flex h-6 items-center gap-1 rounded-control bg-sidebar-hover pl-1.5 text-tiny text-ink-muted">
              <Tag aria-hidden="true" className="size-3" />
              {onOpenLabel ? (
                <button className="hover:text-ink hover:underline" onClick={() => onOpenLabel(label)} type="button">
                  {label}
                </button>
              ) : (
                <span>{label}</span>
              )}
              {canEdit ? (
                <button
                  aria-label={`Remove label ${label}`}
                  className="inline-flex size-5 items-center justify-center rounded-control text-ink-faint hover:text-ink"
                  onClick={() => onRemoveLabel?.(label)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              ) : (
                <span className="pr-1.5" />
              )}
            </span>
          </li>
        ))}

        {canEdit && !adding ? (
          <li>
            <Button onClick={() => setAdding(true)} size="sm" variant="ghost">
              <Plus aria-hidden="true" className="size-3.5" />
              Add label
            </Button>
          </li>
        ) : null}
      </ul>

      {canEdit && adding ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            New label
          </label>
          <Input
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error !== null}
            autoComplete="off"
            className="h-7 w-44 text-tiny"
            id={inputId}
            maxLength={40}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            placeholder="Label name"
            value={draft}
          />
          <Button size="sm" type="submit" variant="secondary">
            Add
          </Button>
          <Button
            onClick={() => {
              setAdding(false);
              setDraft("");
              setError(null);
            }}
            size="sm"
            variant="ghost"
          >
            Cancel
          </Button>
        </form>
      ) : null}

      {error ? (
        <p className="text-tiny text-danger" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
