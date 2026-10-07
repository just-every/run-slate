import { Check } from "lucide-react";
import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { LayoutFieldOffer } from "./LayoutFieldOffer";
import { LayoutGlyph, layoutLabel, layoutOrder, layoutRequirement } from "./LayoutGlyph";
import type { DatabaseField, DatabaseLayout, DatabaseLock } from "./types";
import { sentenceCase } from "./types";

export type RecordOpensIn = "side-peek" | "centre-peek" | "full-page";

const opensInLabel: Record<RecordOpensIn, string> = {
  "side-peek": "Side peek",
  "centre-peek": "Centre peek",
  "full-page": "Full page",
};

/** `DB-004` — the layouts as labelled tiles, with the missing-field offer under them. */
export function LayoutPicker({
  layout,
  fields,
  groupFieldId,
  dateFieldId,
  lock = null,
  pageParityProfile,
  opensIn,
  showRecordIcon,
  wrapAllContent,
  onSelectLayout,
  onSelectGroupField,
  onSelectDateField,
  onCreateGroupField,
  onCreateDateField,
  onOpensInChange,
  onShowRecordIconChange,
  onWrapAllContentChange,
  className,
}: {
  layout: DatabaseLayout;
  fields: readonly DatabaseField[];
  groupFieldId: string | null;
  dateFieldId: string | null;
  lock?: DatabaseLock | null;
  pageParityProfile: KnowledgePolicyProfile["record.page-parity.v1"];
  opensIn: RecordOpensIn;
  showRecordIcon: boolean;
  wrapAllContent: boolean;
  onSelectLayout: (next: DatabaseLayout) => void;
  onSelectGroupField: (fieldId: string) => void;
  onSelectDateField: (fieldId: string) => void;
  onCreateGroupField: () => void;
  onCreateDateField: () => void;
  onOpensInChange: (next: RecordOpensIn) => void;
  onShowRecordIconChange: (next: boolean) => void;
  onWrapAllContentChange: (next: boolean) => void;
  className?: string;
}) {
  const opensInId = useId();
  const locked = lock !== null;
  const requirement = layoutRequirement[layout];
  const selectedRequirementField = requirement === "group" ? groupFieldId : requirement === "date" ? dateFieldId : null;
  const isPage = pageParityProfile === "record-is-page";

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <fieldset className="m-0 border-0 p-0" disabled={locked}>
        <legend className="mb-2 text-tiny font-medium text-ink-muted">Layout</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {layoutOrder.map((option) => {
            const current = option === layout;
            return (
              <button
                aria-pressed={current}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-card border px-2 py-3 text-tiny transition-colors",
                  current
                    ? "border-accent bg-accent-soft text-accent ring-1 ring-accent"
                    : "border-line text-ink-muted hover:bg-sidebar-hover hover:text-ink",
                  locked ? "opacity-60" : "",
                )}
                key={option}
                onClick={() => onSelectLayout(option)}
                type="button"
              >
                <LayoutGlyph className="size-4" layout={option} />
                <span className="flex items-center gap-1 font-medium">
                  {layoutLabel[option]}
                  {current ? <Check aria-hidden="true" className="size-3" /> : null}
                </span>
                {current ? <span className="sr-only">Current layout</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      {requirement && selectedRequirementField === null ? (
        <LayoutFieldOffer
          fields={fields}
          layout={layout}
          onCreateField={requirement === "group" ? onCreateGroupField : onCreateDateField}
          onSelectField={requirement === "group" ? onSelectGroupField : onSelectDateField}
          requirement={requirement}
          selectedFieldId={selectedRequirementField}
        />
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex items-center justify-between gap-3">
          <label className="text-ui text-ink" htmlFor={opensInId}>
            Open {knowledgeNoun("record")}s in
          </label>
          {isPage ? (
            <Select onValueChange={(next) => onOpensInChange(next as RecordOpensIn)} value={opensIn}>
              <SelectTrigger className="w-40" id={opensInId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(opensInLabel) as RecordOpensIn[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {opensInLabel[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-ui text-ink-muted" id={opensInId}>
              A field list
            </span>
          )}
        </div>
        {isPage ? null : (
          <p className="text-tiny text-ink-muted">
            {sentenceCase(knowledgeNoun("record"))}s open as a field list with a print action under this workspace's
            setting, so they carry no icon and no {knowledgeNoun("pageBody")} area.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-ui text-ink" id="layout-show-icon">
            Show {knowledgeNoun("record")} icon
          </span>
          <Switch
            aria-labelledby="layout-show-icon"
            checked={isPage ? showRecordIcon : false}
            disabled={!isPage || locked}
            onCheckedChange={onShowRecordIconChange}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-ui text-ink" id="layout-wrap">
            Wrap all content
          </span>
          <Switch
            aria-labelledby="layout-wrap"
            checked={wrapAllContent}
            disabled={locked}
            onCheckedChange={onWrapAllContentChange}
          />
        </div>
      </div>

      {lock ? (
        <p className="text-tiny text-ink-muted">
          Layout changes are rejected while the structure is locked by {lock.lockedBy}.
        </p>
      ) : null}
    </div>
  );
}
