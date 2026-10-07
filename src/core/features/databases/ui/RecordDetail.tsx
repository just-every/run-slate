import { Maximize2, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Separator, cn } from "../../../ui";
import type { KnowledgePolicyProfile } from "../../../shared/knowledge/policies";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import type { RecordOpensIn } from "./LayoutPicker";
import { RecordComments, RecordHistory } from "./RecordActivity";
import { RecordFieldList } from "./RecordFieldList";
import { RecordIconMark } from "./RecordTitle";
import { RecordRowDetail } from "./RecordRowDetail";
import type { DatabaseField, DatabaseRecord, FieldValue, RecordComment, RecordRevision } from "./types";
import { sentenceCase } from "./types";

const frameClass: Record<RecordOpensIn, string> = {
  "side-peek": "ml-auto h-full w-full max-w-[34rem] border-l border-line bg-surface shadow-[0_0_32px_rgb(15_15_15/0.12)]",
  "centre-peek": "mx-auto my-6 w-full max-w-[52rem] rounded-card border border-line bg-surface shadow-[0_12px_40px_rgb(15_15_15/0.18)]",
  "full-page": "mx-auto w-full bg-canvas",
};

export interface RecordDetailProps {
  record: DatabaseRecord;
  /** Already in the order the database defines (`DB-012`). */
  fields: readonly DatabaseField[];
  databaseName: string;
  /** The trail from the container down to this record; empty under `record-is-row`. */
  treePosition: readonly string[];
  canEditRecord: boolean;
  pageParityProfile: KnowledgePolicyProfile["record.page-parity.v1"];
  /** `DB-010`: how the record opens under `record-is-page`. */
  presentation: RecordOpensIn;
  /** The stored body, rendered by the caller. `null` means the record has none. */
  body: ReactNode | null;
  storedBodyBlockCount: number;
  comments: readonly RecordComment[];
  revisions: readonly RecordRevision[];
  onValueChange: (fieldId: string, next: FieldValue | null) => void;
  onEditValue: (fieldId: string) => void;
  onOpenLink: (linkId: string) => void;
  onOpenRevision: (revisionId: string) => void;
  onOpenFullPage: () => void;
  onPrint: () => void;
  onClose: () => void;
  className?: string;
}

/**
 * `DB-010` and `DB-012`. Under `record-is-page` a record opens as a side peek, a
 * centre peek or a full page, with its icon, its fields, its body, its comments
 * and its history. Under `record-is-row` it opens as a field list with a print
 * action. The body is stored under both values and is never dropped.
 */
export function RecordDetail(props: RecordDetailProps) {
  if (props.pageParityProfile === "record-is-row") {
    return (
      <RecordRowDetail
        canEditRecord={props.canEditRecord}
        className={props.className}
        databaseName={props.databaseName}
        fields={props.fields}
        onClose={props.onClose}
        onEditValue={props.onEditValue}
        onOpenLink={props.onOpenLink}
        onPrint={props.onPrint}
        onValueChange={props.onValueChange}
        record={props.record}
        storedBodyBlockCount={props.storedBodyBlockCount}
      />
    );
  }

  const { record, presentation } = props;
  const inner = presentation === "full-page" ? "mx-auto w-full max-w-reading px-4 py-8" : "px-4 py-4";

  return (
    <div className={cn("flex h-full w-full", presentation === "centre-peek" ? "bg-canvas/70 p-4" : "", props.className)}>
      <div className={cn("flex flex-col overflow-y-auto", frameClass[presentation])}>
        <header className="flex items-center justify-between gap-2 px-4 py-2">
          <nav aria-label="Position in the tree" className="flex min-w-0 items-center gap-1 text-tiny text-ink-muted">
            {props.treePosition.map((crumb, index) => (
              <span className="flex min-w-0 items-center gap-1" key={crumb}>
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                <span className="truncate">{crumb}</span>
              </span>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-0.5">
            {presentation === "full-page" ? null : (
              <Button aria-label="Open as a full page" onClick={props.onOpenFullPage} size="iconSm" variant="ghost">
                <Maximize2 aria-hidden="true" className="size-3.5" />
              </Button>
            )}
            <Button aria-label="Close" onClick={props.onClose} size="iconSm" variant="ghost">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </header>

        <div className={cn("flex flex-col gap-5", inner)}>
          <div className="flex items-start gap-2">
            <RecordIconMark className="mt-1 size-7 text-[1.5rem]" icon={record.icon} />
            <h1 className="text-h1 font-semibold text-ink">{record.title}</h1>
          </div>

          <RecordFieldList
            canEditRecord={props.canEditRecord}
            fields={props.fields}
            onEditValue={props.onEditValue}
            onOpenLink={props.onOpenLink}
            onValueChange={props.onValueChange}
            record={record}
            variant="page"
          />

          <Separator />

          <section aria-label={sentenceCase(knowledgeNoun("pageBody"))}>
            {props.body ?? (
              <p className="text-ui text-ink-faint">
                This {knowledgeNoun("record")} has an empty {knowledgeNoun("pageBody")}.
              </p>
            )}
          </section>

          <Separator />
          <RecordComments comments={props.comments} />
          <Separator />
          <RecordHistory onOpenRevision={props.onOpenRevision} revisions={props.revisions} />
        </div>
      </div>
    </div>
  );
}
