import { ChevronRight, FileText, MoreHorizontal, Plus, Table2, Users } from "lucide-react";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { Badge, Button, cn } from "../../../ui";
import type { NavNode } from "./types";

const indentClasses = ["pl-1.5", "pl-5", "pl-8", "pl-11", "pl-14"] as const;

function indentFor(depth: number): string {
  return indentClasses[Math.min(Math.max(depth, 0), indentClasses.length - 1)];
}

function KindIcon({ kind }: { kind: NavNode["kind"] }) {
  const className = "size-3.5 shrink-0 text-ink-faint";
  if (kind === "container") return <Users aria-hidden="true" className={className} />;
  if (kind === "database") return <Table2 aria-hidden="true" className={className} />;
  return <FileText aria-hidden="true" className={className} />;
}

export interface SidebarPageRowProps {
  node: NavNode;
  /** Nesting level; 0 is a top-level row in its section. */
  depth?: number;
  expanded?: boolean;
  selected?: boolean;
  /** page.lifecycle.v1 — the draft chip exists only under draft-then-publish. */
  lifecyclePolicy: KnowledgePolicyProfile["page.lifecycle.v1"];
  onToggle?: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenActions?: (id: string) => void;
  onAddChild?: (id: string) => void;
}

export function SidebarPageRow({
  node,
  depth = 0,
  expanded = false,
  selected = false,
  lifecyclePolicy,
  onToggle,
  onOpen,
  onOpenActions,
  onAddChild,
}: SidebarPageRowProps) {
  const disclosable = Boolean(node.hasChildren && onToggle);
  const showDraft = lifecyclePolicy === "draft-then-publish" && node.lifecycle === "draft";
  const hoverControl =
    "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100";

  return (
    <div
      className={cn(
        "group flex items-center gap-0.5 rounded-control pr-0.5 text-ink-muted",
        indentFor(depth),
        selected ? "bg-sidebar-hover text-ink" : "hover:bg-sidebar-hover",
      )}
    >
      {disclosable ? (
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${node.title}`}
          className="flex size-5 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-line focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onToggle?.(node.id)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : (
        <span aria-hidden="true" className="size-5 shrink-0" />
      )}

      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-control py-1 text-left text-ui focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => onOpen(node.id)}
        type="button"
      >
        {node.icon ? (
          <span aria-hidden="true" className="w-4 shrink-0 text-center text-tiny leading-none">
            {node.icon}
          </span>
        ) : (
          <KindIcon kind={node.kind} />
        )}
        <span className={cn("min-w-0 truncate", selected ? "font-medium text-ink" : "text-ink")}>{node.title}</span>
        {node.containerName ? (
          <span className="hidden shrink-0 truncate text-micro text-ink-faint sm:inline">in {node.containerName}</span>
        ) : null}
        {showDraft ? (
          <Badge className="shrink-0" tone="draft">
            Draft
          </Badge>
        ) : null}
      </button>

      {onOpenActions ? (
        <Button
          aria-label={`Actions for ${node.title}`}
          className={hoverControl}
          onClick={() => onOpenActions(node.id)}
          size="iconSm"
          variant="ghost"
        >
          <MoreHorizontal aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
      {onAddChild ? (
        <Button
          aria-label={`Add a page inside ${node.title}`}
          className={hoverControl}
          onClick={() => onAddChild(node.id)}
          size="iconSm"
          variant="ghost"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
