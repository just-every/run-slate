import { ChevronDown, Lock, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, DeniedState, EmptyState, ErrorState, LoadingState, cn, type SurfaceState } from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { RecordIconMark } from "./RecordTitle";
import { ViewControls } from "./ViewControls";
import { ViewRulesBar } from "./ViewRulesBar";
import { ViewTabs } from "./ViewTabs";
import type { DatabaseField, DatabaseLock, DatabaseView, RecordIcon } from "./types";
import { sentenceCase } from "./types";

export interface DatabaseSurfaceProps {
  name: string;
  icon: RecordIcon;
  state: SurfaceState;
  views: readonly DatabaseView[];
  activeViewId: string;
  /** Every field the database holds, for the filter, sort and rules displays. */
  fields: readonly DatabaseField[];
  lock: DatabaseLock | null;
  canEdit: boolean;
  searchInView: string;
  /** `DB-003`: the rendered active view. The surface never decides what a layout looks like. */
  children: ReactNode;
  /** The view settings panel when it is open, rendered beside the records. */
  settingsPanel?: ReactNode;
  onSelectView: (viewId: string) => void;
  onRenameView: (viewId: string) => void;
  onDuplicateView: (viewId: string) => void;
  onDeleteView: (viewId: string) => void;
  onAddView: () => void;
  onSearchInViewChange: (next: string) => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
  onOpenGroup: () => void;
  onOpenSettings: () => void;
  onClearRules: () => void;
  onNewRecord: () => void;
  onNewRecordMenu: () => void;
  onRetry: () => void;
  onRequestAccess: () => void;
  className?: string;
}

/** `DB-001` — the database as a node in the tree: its name, its views and its records. */
export function DatabaseSurface(props: DatabaseSurfaceProps) {
  const { state, views, activeViewId } = props;
  const view = views.find((candidate) => candidate.id === activeViewId);

  if (state === "denied") {
    return <DeniedState className="py-16" onRequestAccess={props.onRequestAccess} />;
  }

  return (
    <div className={cn("flex min-w-0 flex-col bg-canvas", props.className)}>
      <div className="flex flex-col gap-3 px-4 pt-6 pb-2 sm:px-8">
        <div className="flex items-center gap-2">
          <RecordIconMark className="size-7 text-[1.5rem]" icon={props.icon} />
          <h1 className="text-h1 font-semibold text-ink">{props.name}</h1>
          {props.lock ? (
            <Badge tone="outline">
              <Lock aria-hidden="true" className="size-3" />
              Structure locked by {props.lock.lockedBy}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ViewTabs
            activeViewId={activeViewId}
            canEdit={props.canEdit}
            lock={props.lock}
            onAddView={props.onAddView}
            onDeleteView={props.onDeleteView}
            onDuplicateView={props.onDuplicateView}
            onRenameView={props.onRenameView}
            onSelectView={props.onSelectView}
            views={views}
          />

          <div className="flex items-center gap-1">
            {view ? (
              <ViewControls
                onOpenFilter={props.onOpenFilter}
                onOpenGroup={props.onOpenGroup}
                onOpenSettings={props.onOpenSettings}
                onOpenSort={props.onOpenSort}
                onSearchInViewChange={props.onSearchInViewChange}
                searchInView={props.searchInView}
                view={view}
              />
            ) : null}
            <div className="flex items-center">
              <Button className="rounded-r-none" disabled={!props.canEdit} onClick={props.onNewRecord} size="sm">
                <Plus aria-hidden="true" className="size-3.5" />
                New
              </Button>
              <Button
                aria-label={`More ways to add a ${knowledgeNoun("record")}`}
                className="rounded-l-none border-l border-accent-hover px-1"
                disabled={!props.canEdit}
                onClick={props.onNewRecordMenu}
                size="sm"
              >
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-start gap-3 px-4 pb-8 sm:px-8">
        <div className="min-w-0 flex-1 rounded-card border border-line bg-surface">
          {view ? (
            <ViewRulesBar
              fields={props.fields}
              onClearAll={props.onClearRules}
              onOpenFilter={props.onOpenFilter}
              onOpenGroup={props.onOpenGroup}
              onOpenSort={props.onOpenSort}
              view={view}
            />
          ) : null}

          {state === "loading" ? <LoadingState rows={6} /> : null}

          {state === "error" ? (
            <ErrorState
              className="m-3"
              detail={`This database could not be loaded. No ${knowledgeNoun("record")} is shown rather than a partial list.`}
              onRetry={props.onRetry}
              title="This database could not be loaded"
            />
          ) : null}

          {state === "empty" ? (
            <EmptyState
              action={
                <Button disabled={!props.canEdit} onClick={props.onNewRecord} size="sm">
                  <Plus aria-hidden="true" className="size-3.5" />
                  New {knowledgeNoun("record")}
                </Button>
              }
              description={`${sentenceCase(knowledgeNoun("record"))}s added here appear in every view of this database.`}
              title={`No ${knowledgeNoun("record")}s yet`}
            />
          ) : null}

          {state === "ready" ? props.children : null}
        </div>

        {props.settingsPanel ? <div className="hidden shrink-0 lg:block">{props.settingsPanel}</div> : null}
      </div>
    </div>
  );
}
