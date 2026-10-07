import { Archive, ChevronRight, Settings, X, Zap } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, Input, cn } from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { FilterBuilder } from "./FilterBuilder";
import { GroupSettings } from "./GroupSettings";
import { LayoutPicker, type RecordOpensIn } from "./LayoutPicker";
import { layoutLabel } from "./LayoutGlyph";
import { LockStructureControl } from "./LockStructureControl";
import { PropertyVisibilityList } from "./PropertyVisibilityList";
import { SortBuilder } from "./SortBuilder";
import type { DatabaseField, DatabaseLayout, DatabaseLock, DatabaseView, FilterState, SortRule } from "./types";
import { findField, sentenceCase } from "./types";

export type ViewSettingsSection = "layout" | "properties" | "filter" | "sort" | "group" | "lock";

function Section({
  id,
  label,
  summary,
  open,
  onToggle,
  children,
}: {
  id: ViewSettingsSection;
  label: string;
  summary?: ReactNode;
  open: boolean;
  onToggle: (id: ViewSettingsSection) => void;
  children: ReactNode;
}) {
  const regionId = `view-settings-${id}`;
  return (
    <div className="border-b border-line last:border-b-0">
      <button
        aria-controls={regionId}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left transition-colors hover:bg-sidebar-hover"
        onClick={() => onToggle(id)}
        type="button"
      >
        <span className="text-ui text-ink">{label}</span>
        <span className="flex items-center gap-1 text-ui text-ink-muted">
          {summary}
          <ChevronRight aria-hidden="true" className={cn("size-3.5 transition-transform", open ? "rotate-90" : "")} />
        </span>
      </button>
      <div className="px-2 pb-3" hidden={!open} id={regionId}>
        {children}
      </div>
    </div>
  );
}

function LinkRow({ icon, label, count, onClick }: { icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left transition-colors hover:bg-sidebar-hover"
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-1.5 text-ui text-ink">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1 text-ui text-ink-muted">
        {count === undefined ? null : count}
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </span>
    </button>
  );
}

export interface ViewSettingsPanelProps {
  view: DatabaseView;
  fields: readonly DatabaseField[];
  lock: DatabaseLock | null;
  /** `full` access — the level `DB-009` needs to unlock. */
  hasFullAccess: boolean;
  canEdit: boolean;
  pageParityProfile: KnowledgePolicyProfile["record.page-parity.v1"];
  opensIn: RecordOpensIn;
  showRecordIcon: boolean;
  wrapAllContent: boolean;
  automationCount: number;
  archivedCount: number;
  initialSection?: ViewSettingsSection | null;
  onRenameView: (name: string) => void;
  onSelectLayout: (layout: DatabaseLayout) => void;
  onSelectGroupField: (fieldId: string | null) => void;
  onSelectDateField: (fieldId: string) => void;
  onCreateGroupField: () => void;
  onCreateDateField: () => void;
  onOpensInChange: (next: RecordOpensIn) => void;
  onShowRecordIconChange: (next: boolean) => void;
  onWrapAllContentChange: (next: boolean) => void;
  onToggleFieldVisibility: (fieldId: string, visible: boolean) => void;
  onShowAllFields: () => void;
  onHideAllFields: () => void;
  onFilterChange: (next: FilterState) => void;
  onAddFilterRule: () => void;
  onClearFilter: () => void;
  onSortsChange: (next: readonly SortRule[]) => void;
  onAddSort: () => void;
  onClearSorts: () => void;
  onMoveSort: (sortId: string, direction: "up" | "down") => void;
  onHideEmptyGroupsChange: (next: boolean) => void;
  onEditProperties: () => void;
  onOpenAutomations: () => void;
  onViewArchived: () => void;
  onLock: () => void;
  onUnlock: () => void;
  onClose: () => void;
  className?: string;
}

/** `DB-003` to `DB-009` — everything a view carries, in one panel. */
export function ViewSettingsPanel(props: ViewSettingsPanelProps) {
  const { view, fields, lock, className } = props;
  const [open, setOpen] = useState<ViewSettingsSection | null>(props.initialSection ?? null);
  const nameId = useId();
  const groupField = findField(fields, view.groupFieldId);
  const toggle = (id: ViewSettingsSection) => setOpen((current) => (current === id ? null : id));

  return (
    <section
      aria-label="View settings"
      className={cn("flex w-panel max-w-full flex-col rounded-card border border-line bg-surface p-2 shadow-[0_12px_32px_rgb(15_15_15/0.14)]", className)}
    >
      <header className="flex items-center justify-between gap-2 px-2 pb-2">
        <h2 className="text-tiny font-medium text-ink-muted">View settings</h2>
        <Button aria-label="Close view settings" onClick={props.onClose} size="iconSm" variant="ghost">
          <X aria-hidden="true" className="size-3.5" />
        </Button>
      </header>

      <div className="px-2 pb-2">
        <label className="sr-only" htmlFor={nameId}>
          View name
        </label>
        <Input
          disabled={lock !== null || !props.canEdit}
          id={nameId}
          onChange={(event) => props.onRenameView(event.target.value)}
          placeholder="View name"
          value={view.name}
        />
      </div>

      <Section id="layout" label="Layout" onToggle={toggle} open={open === "layout"} summary={layoutLabel[view.layout]}>
        <LayoutPicker
          dateFieldId={view.dateFieldId}
          fields={fields}
          groupFieldId={view.groupFieldId}
          layout={view.layout}
          lock={lock}
          onCreateDateField={props.onCreateDateField}
          onCreateGroupField={props.onCreateGroupField}
          onOpensInChange={props.onOpensInChange}
          onSelectDateField={props.onSelectDateField}
          onSelectGroupField={props.onSelectGroupField}
          onSelectLayout={props.onSelectLayout}
          onShowRecordIconChange={props.onShowRecordIconChange}
          onWrapAllContentChange={props.onWrapAllContentChange}
          opensIn={props.opensIn}
          pageParityProfile={props.pageParityProfile}
          showRecordIcon={props.showRecordIcon}
          wrapAllContent={props.wrapAllContent}
        />
      </Section>

      <Section
        id="properties"
        label="Property visibility"
        onToggle={toggle}
        open={open === "properties"}
        summary={`${view.visibleFieldIds.length} of ${fields.length}`}
      >
        <PropertyVisibilityList
          fields={fields}
          lock={lock}
          onHideAll={props.onHideAllFields}
          onShowAll={props.onShowAllFields}
          onToggleField={props.onToggleFieldVisibility}
          visibleFieldIds={view.visibleFieldIds}
        />
      </Section>

      <Section
        id="filter"
        label="Filter"
        onToggle={toggle}
        open={open === "filter"}
        summary={view.filter.rules.length === 0 ? "None" : `${view.filter.rules.length}`}
      >
        <FilterBuilder
          fields={fields}
          filter={view.filter}
          lock={lock}
          onAddRule={props.onAddFilterRule}
          onChange={props.onFilterChange}
          onClear={props.onClearFilter}
        />
      </Section>

      <Section
        id="sort"
        label="Sort"
        onToggle={toggle}
        open={open === "sort"}
        summary={view.sorts.length === 0 ? "None" : `${view.sorts.length}`}
      >
        <SortBuilder
          fields={fields}
          lock={lock}
          onAddSort={props.onAddSort}
          onChange={props.onSortsChange}
          onClear={props.onClearSorts}
          onMove={props.onMoveSort}
          sorts={view.sorts}
        />
      </Section>

      <Section
        id="group"
        label="Group"
        onToggle={toggle}
        open={open === "group"}
        summary={groupField ? groupField.name : "None"}
      >
        <GroupSettings
          fields={fields}
          groupFieldId={view.groupFieldId}
          hideEmptyGroups={view.hideEmptyGroups}
          lock={lock}
          onHideEmptyGroupsChange={props.onHideEmptyGroupsChange}
          onSelectGroupField={props.onSelectGroupField}
        />
      </Section>

      <div className="mt-2 border-t border-line pt-2">
        <h3 className="px-2 pb-1 text-micro font-medium tracking-wide text-ink-faint uppercase">Data source</h3>
        <LinkRow
          icon={<Settings aria-hidden="true" className="size-3.5 text-ink-faint" />}
          label="Edit properties"
          onClick={props.onEditProperties}
        />
        <LinkRow
          count={props.automationCount}
          icon={<Zap aria-hidden="true" className="size-3.5 text-ink-faint" />}
          label="Automations"
          onClick={props.onOpenAutomations}
        />
        <LinkRow
          count={props.archivedCount}
          icon={<Archive aria-hidden="true" className="size-3.5 text-ink-faint" />}
          label={`${sentenceCase(knowledgeNoun("record"))}s in the archive`}
          onClick={props.onViewArchived}
        />
      </div>

      <Section id="lock" label="Lock structure" onToggle={toggle} open={open === "lock"} summary={lock ? "Locked" : "Unlocked"}>
        <LockStructureControl
          canLock={props.canEdit}
          canUnlock={props.hasFullAccess}
          lock={lock}
          onLock={props.onLock}
          onUnlock={props.onUnlock}
        />
      </Section>
    </section>
  );
}
