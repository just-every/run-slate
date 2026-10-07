import type { ReactNode } from "react";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { ScrollArea, Separator } from "../../../ui";
import { GlobalCreateMenu, type GlobalCreateMenuProps } from "./GlobalCreateMenu";
import { SidebarDestinations } from "./SidebarDestinations";
import { SidebarFooterLinks } from "./SidebarFooterLinks";
import { SidebarSection } from "./SidebarSection";
import { SidebarTree } from "./SidebarTree";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { noun, nounPlural, pluralHeading } from "./nouns";
import type { NavDestinationId, NavFooterId, NavNode, NavSectionKey, ThemeChoice, WorkspaceSummary } from "./types";

export interface SidebarTrees {
  /** NAV-002 — the member's own recently opened pages. */
  recents: readonly NavNode[];
  /** NAV-003 / PAGE-008 — personal favourites, pages and containers. */
  favourites: readonly NavNode[];
  /** TREE-003 — pages granted individually, each naming its container. */
  shared: readonly NavNode[];
  /** The member's personal pages. */
  personal: readonly NavNode[];
  /** The containers the member belongs to, each nesting its own tree. */
  containers: readonly NavNode[];
}

export interface SidebarProps {
  workspace: WorkspaceSummary;
  theme: ThemeChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;

  activeDestination: NavDestinationId | null;
  inboxUnread: number;
  onSelectDestination: (id: NavDestinationId) => void;

  create: Omit<GlobalCreateMenuProps, "triggerClassName">;

  lifecyclePolicy: KnowledgePolicyProfile["page.lifecycle.v1"];
  trees: SidebarTrees;
  openSections: Readonly<Record<NavSectionKey, boolean>>;
  onToggleSection: (key: NavSectionKey) => void;
  expandedIds: readonly string[];
  onToggleNode: (id: string) => void;
  selectedId?: string | null;
  onOpenNode: (id: string) => void;
  onOpenNodeActions?: (id: string) => void;
  onAddChild?: (id: string) => void;
  onAddPersonalPage?: () => void;
  onAddContainer?: () => void;

  activeFooter?: NavFooterId | null;
  onSelectFooter: (id: NavFooterId) => void;

  /** NAV-004 — where the workspace.navigation.after.v1 slot renders. */
  extraSections?: ReactNode;
}

export function Sidebar(props: SidebarProps) {
  const { trees, openSections, expandedIds, selectedId, lifecyclePolicy } = props;

  const renderTree = (nodes: readonly NavNode[], withChildControls: boolean) => (
    <SidebarTree
      expandedIds={expandedIds}
      lifecyclePolicy={lifecyclePolicy}
      nodes={nodes}
      onAddChild={withChildControls ? props.onAddChild : undefined}
      onOpen={props.onOpenNode}
      onOpenActions={props.onOpenNodeActions}
      onToggle={props.onToggleNode}
      selectedId={selectedId}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex items-center gap-1 px-1.5 pt-2">
        <WorkspaceSwitcher
          onOpenSettings={props.onOpenSettings}
          onSignOut={props.onSignOut}
          onThemeChange={props.onThemeChange}
          theme={props.theme}
          workspace={props.workspace}
        />
      </div>

      <div className="mt-1">
        <SidebarDestinations
          active={props.activeDestination}
          inboxUnread={props.inboxUnread}
          onSelect={props.onSelectDestination}
        />
      </div>

      <div className="px-2 py-2">
        <GlobalCreateMenu {...props.create} triggerClassName="w-full justify-start" />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-2 px-1 pb-3">
          <SidebarSection
            emptyMessage="Nothing opened yet."
            isEmpty={trees.recents.length === 0}
            onOpenChange={() => props.onToggleSection("recents")}
            open={openSections.recents}
            title="Recents"
          >
            {renderTree(trees.recents, false)}
          </SidebarSection>

          <SidebarSection
            emptyMessage="No favourites yet. Star a page to keep it here."
            isEmpty={trees.favourites.length === 0}
            onOpenChange={() => props.onToggleSection("favourites")}
            open={openSections.favourites}
            title="Favourites"
          >
            {renderTree(trees.favourites, true)}
          </SidebarSection>

          <SidebarSection
            emptyMessage="Nothing has been shared with you."
            isEmpty={trees.shared.length === 0}
            onOpenChange={() => props.onToggleSection("shared")}
            open={openSections.shared}
            title="Shared with me"
          >
            {renderTree(trees.shared, false)}
          </SidebarSection>

          <SidebarSection
            action={props.onAddPersonalPage ? { label: "Add a private page", onClick: props.onAddPersonalPage } : undefined}
            emptyMessage="No private pages yet."
            isEmpty={trees.personal.length === 0}
            onOpenChange={() => props.onToggleSection("personal")}
            open={openSections.personal}
            title="Private"
          >
            {renderTree(trees.personal, true)}
          </SidebarSection>

          <SidebarSection
            action={props.onAddContainer ? { label: `Add a ${noun("container")}`, onClick: props.onAddContainer } : undefined}
            emptyMessage={`You belong to no ${nounPlural("container")} yet.`}
            isEmpty={trees.containers.length === 0}
            onOpenChange={() => props.onToggleSection("containers")}
            open={openSections.containers}
            title={pluralHeading("container")}
          >
            {renderTree(trees.containers, true)}
          </SidebarSection>

          {props.extraSections}
        </div>
      </ScrollArea>

      <Separator />
      <div className="py-2">
        <SidebarFooterLinks active={props.activeFooter} onSelect={props.onSelectFooter} />
      </div>
    </div>
  );
}
