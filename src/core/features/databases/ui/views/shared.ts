import type { DatabaseField, DatabaseLock, DatabaseRecord, FieldValue } from "../types";

/** What every layout needs to render records and let a member act on them. */
export interface RecordViewProps {
  /** The fields this view shows, already in the order the view carries. */
  fields: readonly DatabaseField[];
  records: readonly DatabaseRecord[];
  /** `DB-010`: the per-record icon is shown under `record-is-page` only. */
  showRecordIcon: boolean;
  /** Edit access on the records themselves. A locked structure does not remove it (`DB-009`). */
  canEditRecords: boolean;
  lock?: DatabaseLock | null;
  onOpenRecord: (recordId: string) => void;
  onValueChange: (recordId: string, fieldId: string, next: FieldValue | null) => void;
  onEditValue: (recordId: string, fieldId: string) => void;
  onOpenLink: (linkId: string) => void;
  onNewRecord: () => void;
  className?: string;
}
