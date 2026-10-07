import { ChevronRight, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import {
  Badge,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { PageIcon } from "./PageIcon";
import type { PageDropPosition, PageMoveDirection, PageTreeNodeData } from "./types";

export interface PageTreeNodeHandlers {
  onSelect: (pageId: string) => void;
  onToggleExpand: (pageId: string) => void;
  onCreateChild: (pageId: string) => void;
  onMove: (pageId: string, direction: PageMoveDirection) => void;
  onDragStartNode: (pageId: string) => void;
  onDragOverNode: (pageId: string, position: PageDropPosition) => void;
  onDropNode: () => void;
  onDragEndNode: () => void;
}

/**
 * One node of the tree, recursive (`TREE-001`, unlimited depth). The drag handle
 * carries reordering and re-parenting (`TREE-002`); the same four moves are on
 * the node's own menu because `NAV-006` requires a touch form for every gesture.
 */
export function PageTreeNode({
  node,
  depth,
  expandedIds,
  selectedId,
  canEdit,
  lifecycleProfile,
  draggingId,
  dropTarget,
  handlers,
}: {
  node: PageTreeNodeData;
  depth: number;
  expandedIds: ReadonlySet<string>;
  selectedId: string | null;
  canEdit: boolean;
  lifecycleProfile: KnowledgePolicyProfile["page.lifecycle.v1"];
  draggingId: string | null;
  dropTarget: { id: string; position: PageDropPosition } | null;
  handlers: PageTreeNodeHandlers;
}) {
  const expanded = expandedIds.has(node.id);
  const selected = selectedId === node.id;
  const dropping = dropTarget?.id === node.id ? dropTarget.position : null;
  const showDraftChip = lifecycleProfile === "draft-then-publish" && node.lifecycle === "draft";

  return (
    <li>
      <div
        className={cn(
          "group/node relative flex h-7 items-center gap-0.5 rounded-control pr-1 transition-colors",
          selected ? "bg-sidebar-hover text-ink" : "text-ink-muted hover:bg-sidebar-hover",
          draggingId === node.id ? "opacity-50" : "",
          dropping === "inside" ? "outline-2 outline-accent outline-offset-[-2px]" : "",
          dropping === "before" ? "border-t-2 border-accent" : "",
          dropping === "after" ? "border-b-2 border-accent" : "",
        )}
        onDragOver={(event) => {
          if (!canEdit || draggingId === null) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          const offset = (event.clientY - box.top) / box.height;
          handlers.onDragOverNode(node.id, offset < 0.25 ? "before" : offset > 0.75 ? "after" : "inside");
        }}
        onDrop={(event) => {
          if (!canEdit || draggingId === null) return;
          event.preventDefault();
          handlers.onDropNode();
        }}
        style={{ paddingLeft: `${depth * 0.75 + 0.25}rem` }}
      >
        {canEdit ? (
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 cursor-grab items-center justify-center text-ink-faint opacity-0 group-hover/node:opacity-100"
            draggable
            onDragEnd={handlers.onDragEndNode}
            onDragStart={() => handlers.onDragStartNode(node.id)}
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : null}

        {node.hasChildren ? (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${node.title}`}
            className="flex size-5 shrink-0 items-center justify-center rounded-control hover:bg-line"
            onClick={() => handlers.onToggleExpand(node.id)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className={cn("size-3.5 transition-transform", expanded ? "rotate-90" : "")} />
          </button>
        ) : (
          <span aria-hidden="true" className="size-5 shrink-0" />
        )}

        <button
          aria-current={selected ? "page" : undefined}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-control py-1 text-left text-ui"
          onClick={() => handlers.onSelect(node.id)}
          type="button"
        >
          <PageIcon fallback icon={node.icon} size="row" />
          <span className={cn("truncate", selected ? "font-medium" : "")}>{node.title}</span>
          {showDraftChip ? <Badge tone="draft">Draft</Badge> : null}
        </button>

        {canEdit ? (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/node:opacity-100 focus-within:opacity-100">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`Actions for ${node.title}`}
                className="flex size-5 items-center justify-center rounded-control text-ink-faint hover:bg-line hover:text-ink"
              >
                <MoreHorizontal aria-hidden="true" className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onSelect={() => handlers.onCreateChild(node.id)}>Add a page inside</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "up")}>Move up</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "down")}>Move down</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "outdent")}>Outdent</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "indent")}>Indent</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              aria-label={`Add a page inside ${node.title}`}
              className="flex size-5 items-center justify-center rounded-control text-ink-faint hover:bg-line hover:text-ink"
              onClick={() => handlers.onCreateChild(node.id)}
              type="button"
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {node.hasChildren && expanded ? (
        <ul>
          {(node.children ?? []).map((child) => (
            <PageTreeNode
              canEdit={canEdit}
              depth={depth + 1}
              dropTarget={dropTarget}
              draggingId={draggingId}
              expandedIds={expandedIds}
              handlers={handlers}
              key={child.id}
              lifecycleProfile={lifecycleProfile}
              node={child}
              selectedId={selectedId}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
