import { Plus, Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  Button,
  cn,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  type SurfaceState,
} from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { PageTreeNode, type PageTreeNodeHandlers } from "./PageTreeNode";
import type { PageDropPosition, PageMoveDirection, PageTreeNodeData } from "./types";

/**
 * `TREE-004` — narrow to the nodes whose title matches, keeping their ancestors
 * so a match is never orphaned. Returns the surviving tree and the ids that must
 * be open for the matches to be visible; the member's own stored expansion is
 * left alone.
 */
export function filterPageTree(
  nodes: readonly PageTreeNodeData[],
  query: string,
): { nodes: readonly PageTreeNodeData[]; forcedOpenIds: readonly string[] } {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return { nodes, forcedOpenIds: [] };

  const forcedOpenIds: string[] = [];

  const walk = (list: readonly PageTreeNodeData[]): PageTreeNodeData[] =>
    list.flatMap((node) => {
      const children = walk(node.children ?? []);
      const matches = node.title.toLowerCase().includes(needle);
      if (!matches && children.length === 0) return [];
      if (children.length > 0) forcedOpenIds.push(node.id);
      return [{ ...node, children, hasChildren: children.length > 0 }];
    });

  return { nodes: walk(nodes), forcedOpenIds };
}

/**
 * A container's page tree (`TREE-001`…`TREE-005`): unlimited depth, expansion
 * remembered per member, a title filter that clears in one action, creation at
 * the foot and as a child, and reordering by drag or by the node's own menu.
 */
export function PageTree({
  state,
  containerName,
  nodes,
  expandedIds,
  onToggleExpand,
  selectedId = null,
  onSelect,
  filter,
  onFilterChange,
  onClearFilter,
  canEdit = false,
  lifecycleProfile,
  onCreateChild,
  onCreateAtFoot,
  onMove,
  onDropMove,
  onRetry,
  className,
}: {
  state: SurfaceState;
  containerName: string;
  nodes: readonly PageTreeNodeData[];
  expandedIds: readonly string[];
  onToggleExpand: (pageId: string) => void;
  selectedId?: string | null;
  onSelect: (pageId: string) => void;
  filter: string;
  onFilterChange: (next: string) => void;
  onClearFilter: () => void;
  canEdit?: boolean;
  lifecycleProfile: KnowledgePolicyProfile["page.lifecycle.v1"];
  onCreateChild: (parentPageId: string) => void;
  onCreateAtFoot: () => void;
  onMove: (pageId: string, direction: PageMoveDirection) => void;
  onDropMove: (pageId: string, targetPageId: string, position: PageDropPosition) => void;
  onRetry?: () => void;
  className?: string;
}) {
  const filterId = useId();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: PageDropPosition } | null>(null);

  const { nodes: visible, forcedOpenIds } = useMemo(() => filterPageTree(nodes, filter), [nodes, filter]);
  const effectiveExpanded = useMemo(
    () => new Set<string>([...expandedIds, ...forcedOpenIds]),
    [expandedIds, forcedOpenIds],
  );

  const handlers: PageTreeNodeHandlers = {
    onSelect,
    onToggleExpand,
    onCreateChild,
    onMove,
    onDragStartNode: (pageId) => setDraggingId(pageId),
    onDragOverNode: (pageId, position) => setDropTarget({ id: pageId, position }),
    onDropNode: () => {
      if (draggingId !== null && dropTarget !== null && dropTarget.id !== draggingId) {
        onDropMove(draggingId, dropTarget.id, dropTarget.position);
      }
      setDraggingId(null);
      setDropTarget(null);
    },
    onDragEndNode: () => {
      setDraggingId(null);
      setDropTarget(null);
    },
  };

  return (
    <section aria-label={`Pages in ${containerName}`} className={cn("flex w-full flex-col gap-1.5", className)}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <label className="sr-only" htmlFor={filterId}>
          Search by title
        </label>
        <Input
          autoComplete="off"
          className="h-7 pr-7 pl-7 text-tiny"
          id={filterId}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Search by title"
          type="search"
          value={filter}
        />
        {filter.length > 0 ? (
          <button
            aria-label="Clear the title filter"
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-control text-ink-faint hover:bg-sidebar-hover hover:text-ink"
            onClick={onClearFilter}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>

      {state === "loading" ? <LoadingState rows={6} /> : null}
      {state === "error" ? (
        <ErrorState detail="The tree did not load." onRetry={onRetry} title="Could not load this tree" />
      ) : null}
      {state === "empty" ? (
        <EmptyState
          action={
            canEdit ? (
              <Button onClick={onCreateAtFoot} size="sm" variant="secondary">
                <Plus aria-hidden="true" className="size-3.5" />
                Add a page in {containerName}
              </Button>
            ) : undefined
          }
          description={`No page has been added to this ${knowledgeNoun("container")} yet.`}
          title="Nothing here yet"
        />
      ) : null}

      {state === "ready" ? (
        visible.length === 0 ? (
          <p className="px-2 py-4 text-ui text-ink-muted">No page title matches “{filter.trim()}”.</p>
        ) : (
          <ul className="flex flex-col">
            {visible.map((node) => (
              <PageTreeNode
                canEdit={canEdit}
                depth={0}
                dropTarget={dropTarget}
                draggingId={draggingId}
                expandedIds={effectiveExpanded}
                handlers={handlers}
                key={node.id}
                lifecycleProfile={lifecycleProfile}
                node={node}
                selectedId={selectedId}
              />
            ))}
          </ul>
        )
      ) : null}

      {state === "ready" && canEdit ? (
        <Button className="justify-start" onClick={onCreateAtFoot} size="sm" variant="ghost">
          <Plus aria-hidden="true" className="size-3.5" />
          Add a page in {containerName}
        </Button>
      ) : null}
    </section>
  );
}
