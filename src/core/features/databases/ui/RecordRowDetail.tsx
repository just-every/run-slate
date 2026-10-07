import { MoreHorizontal, Printer, X } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  cn,
} from "../../../ui";
import { knowledgeNoun } from "../../../shared/knowledge/vocabulary";
import { RecordFieldList } from "./RecordFieldList";
import type { DatabaseField, DatabaseRecord, FieldValue } from "./types";
import { sentenceCase } from "./types";

/**
 * `DB-010` under `record-is-row`: a record opens as a field list with a print
 * action, and carries no icon, no body area and no position in the tree. The body
 * is still stored — this says so rather than hiding it silently, so a workspace
 * can be switched back and an imported record with a body keeps it.
 */
export function RecordRowDetail({
  record,
  fields,
  databaseName,
  canEditRecord,
  storedBodyBlockCount,
  onValueChange,
  onEditValue,
  onOpenLink,
  onPrint,
  onClose,
  className,
}: {
  record: DatabaseRecord;
  fields: readonly DatabaseField[];
  databaseName: string;
  canEditRecord: boolean;
  /** How many blocks the stored body holds. Zero means the record never had one. */
  storedBodyBlockCount: number;
  onValueChange: (fieldId: string, next: FieldValue | null) => void;
  onEditValue: (fieldId: string) => void;
  onOpenLink: (linkId: string) => void;
  onPrint: () => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full justify-center bg-canvas p-4", className)}>
      <section
        aria-label={`${record.title} — field list`}
        className="flex w-full max-w-[48rem] flex-col rounded-card border border-line bg-surface"
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <p className="truncate text-tiny text-ink-muted">{databaseName}</p>
          <div className="flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label={`More actions for ${record.title}`} size="iconSm" variant="ghost">
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onPrint}>
                  <Printer aria-hidden="true" className="size-3.5" />
                  Print
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button aria-label="Close" onClick={onClose} size="iconSm" variant="ghost">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          <h1 className="text-h2 font-semibold text-ink">{record.title}</h1>

          <RecordFieldList
            canEditRecord={canEditRecord}
            fields={fields}
            onEditValue={onEditValue}
            onOpenLink={onOpenLink}
            onValueChange={onValueChange}
            record={record}
            variant="row"
          />

          {storedBodyBlockCount > 0 ? (
            <p className="rounded-card border border-line bg-sidebar px-3 py-2 text-tiny text-ink-muted">
              This {knowledgeNoun("record")} has a stored {knowledgeNoun("pageBody")} of {storedBodyBlockCount} block
              {storedBodyBlockCount === 1 ? "" : "s"}. {sentenceCase(knowledgeNoun("record"))}s open as a field list in
              this workspace, so it is not shown here. It is kept, it exports, and it appears again if the workspace
              switches back.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
