import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { SidebarPageRow } from "./SidebarPageRow";
import type { NavNode } from "./types";

export interface SidebarTreeProps {
  nodes: readonly NavNode[];
  /** Ids whose children are disclosed. */
  expandedIds: readonly string[];
  selectedId?: string | null;
  lifecyclePolicy: KnowledgePolicyProfile["page.lifecycle.v1"];
  depth?: number;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onOpenActions?: (id: string) => void;
  onAddChild?: (id: string) => void;
}

/** The nested page tree a sidebar section shows (NAV-004). */
export function SidebarTree({
  nodes,
  expandedIds,
  selectedId,
  lifecyclePolicy,
  depth = 0,
  onToggle,
  onOpen,
  onOpenActions,
  onAddChild,
}: SidebarTreeProps) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => {
        const expanded = expandedIds.includes(node.id);
        return (
          <li key={node.id}>
            <SidebarPageRow
              depth={depth}
              expanded={expanded}
              lifecyclePolicy={lifecyclePolicy}
              node={node}
              onAddChild={onAddChild}
              onOpen={onOpen}
              onOpenActions={onOpenActions}
              onToggle={onToggle}
              selected={selectedId === node.id}
            />
            {expanded && node.children && node.children.length > 0 ? (
              <SidebarTree
                depth={depth + 1}
                expandedIds={expandedIds}
                lifecyclePolicy={lifecyclePolicy}
                nodes={node.children}
                onAddChild={onAddChild}
                onOpen={onOpen}
                onOpenActions={onOpenActions}
                onToggle={onToggle}
                selectedId={selectedId}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
