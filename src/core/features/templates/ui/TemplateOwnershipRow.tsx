import { ArrowLeftRight, Copy, FileText, Pencil, Trash2 } from "lucide-react";
import { Badge, cn } from "../../../ui";
import { GuardedAction } from "./GuardedAction";
import { containerNoun } from "./nouns";
import type { TemplateSummary } from "./types";

/** `TMPL-004` — the two refusals a shipped template carries, stated in words. */
const shippedEditRefusal = "A template that ships with Slate cannot be edited. Duplicate it instead.";
const shippedDeleteRefusal = "A template that ships with Slate cannot be deleted. Duplicate it instead.";

/**
 * `TMPL-004` and `TMPL-006` — one row of the template list.
 *
 * A shipped template keeps its edit and delete controls on screen as disabled
 * controls carrying the reason, and offers duplication into an editable copy.
 * Moving a template between the workspace and one container is one action.
 */
export function TemplateOwnershipRow({
  template,
  move,
  onEdit,
  onDelete,
  onDuplicate,
  className,
}: {
  template: TemplateSummary;
  /**
   * The single move action (`TMPL-006`). The caller supplies the label and the
   * sentence describing where the template ends up.
   */
  move: { label: string; description: string; onMove: () => void };
  onEdit: (templateId: string) => void;
  onDelete: (templateId: string) => void;
  onDuplicate: (templateId: string) => void;
  className?: string;
}) {
  const shipped = template.origin === "shipped";
  const home =
    template.home.kind === "workspace"
      ? "Workspace"
      : `${template.home.containerName} ${containerNoun}`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar text-ui"
        >
          {template.icon ?? <FileText className="size-3.5 text-ink-muted" />}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-ui font-medium text-ink">
            {template.title}
            <Badge tone={shipped ? "outline" : "neutral"}>{shipped ? "Shipped" : "Custom"}</Badge>
            <Badge tone="neutral">{home}</Badge>
          </p>
          {template.description ? (
            <p className="mt-0.5 text-tiny text-ink-muted">{template.description}</p>
          ) : null}
          <p className="mt-0.5 text-tiny text-ink-faint">{move.description}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-2 sm:justify-end">
        <GuardedAction
          align="end"
          icon={<ArrowLeftRight aria-hidden="true" className="size-3.5" />}
          label={move.label}
          onClick={move.onMove}
        />
        <GuardedAction
          align="end"
          icon={<Copy aria-hidden="true" className="size-3.5" />}
          label="Duplicate into an editable copy"
          onClick={() => onDuplicate(template.id)}
        />
        <GuardedAction
          align="end"
          icon={<Pencil aria-hidden="true" className="size-3.5" />}
          label="Edit"
          onClick={() => onEdit(template.id)}
          reason={shipped ? shippedEditRefusal : null}
        />
        <GuardedAction
          align="end"
          icon={<Trash2 aria-hidden="true" className="size-3.5" />}
          label="Delete"
          onClick={() => onDelete(template.id)}
          reason={shipped ? shippedDeleteRefusal : null}
          variant={shipped ? "secondary" : "danger"}
        />
      </div>
    </div>
  );
}
