import type { SurfaceState } from "../../../ui";

/** A stored colour from the workspace palette, used by select, status and group chips. */
export type RecordColour =
  "neutral" | "yellow" | "blue" | "green" | "red" | "purple";

export const recordColourClass: Record<RecordColour, string> = {
  neutral: "bg-sidebar-hover text-ink-muted",
  yellow: "bg-hl-yellow text-ink",
  blue: "bg-hl-blue text-ink",
  green: "bg-hl-green text-ink",
  red: "bg-hl-red text-ink",
  purple: "bg-hl-purple text-ink",
};

export const recordColourDotClass: Record<RecordColour, string> = {
  neutral: "bg-line-strong",
  yellow: "bg-hl-yellow",
  blue: "bg-hl-blue",
  green: "bg-hl-green",
  red: "bg-hl-red",
  purple: "bg-hl-purple",
};

/**
 * `DB-002` — the field types 1.0 stores. Created and updated metadata are four
 * concrete fields because each sorts and exports on its own.
 */
export type DatabaseFieldType =
  | "text"
  | "number"
  | "checkbox"
  | "date"
  | "select"
  | "multi-select"
  | "status"
  | "person"
  | "file"
  | "url"
  | "email"
  | "phone"
  | "place"
  | "relation"
  | "rollup"
  | "formula"
  | "created-time"
  | "created-by"
  | "updated-time"
  | "updated-by"
  | "identifier";

/** `DB-002`: rollup and formula are stored and displayed, never recomputed in 1.0. */
export const notRecomputedFieldTypes: readonly DatabaseFieldType[] = [
  "rollup",
  "formula",
];

export function isNotRecomputed(type: DatabaseFieldType): boolean {
  return notRecomputedFieldTypes.includes(type);
}

export interface FieldOption {
  id: string;
  label: string;
  colour: RecordColour;
}

export interface RecordPerson {
  id: string;
  name: string;
  imageUrl?: string | null;
}

export interface RecordFile {
  id: string;
  name: string;
}

/** A link to another record, used by relation values. */
export interface RecordLink {
  id: string;
  label: string;
}

export interface DatabaseField {
  id: string;
  name: string;
  type: DatabaseFieldType;
  /** `DB-012`: a field the member may not edit is shown and not editable, never hidden. */
  editable: boolean;
  evaluationState?: "current" | "retained-not-recomputed";
  /** select, multi-select and status only. */
  options?: readonly FieldOption[];
  /**
   * rollup and formula only: the stored configuration, shown so a member can see
   * what the value came from. Never evaluated (`DB-002`).
   */
  expression?: string | null;
  /** rollup and formula only: when the carried value was last produced elsewhere. */
  valueFrom?: string | null;
}

/**
 * One stored value. `null` is the field's empty value. Display strings are
 * produced upstream so no component formats, computes or invents anything.
 */
export type FieldValue =
  | { kind: "text"; text: string }
  | { kind: "number"; number: number; display: string }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "date"; display: string; endDisplay?: string | null }
  | { kind: "options"; optionIds: readonly string[] }
  | { kind: "people"; people: readonly RecordPerson[] }
  | { kind: "files"; files: readonly RecordFile[] }
  | { kind: "link"; href: string; label: string }
  | { kind: "place"; label: string }
  | { kind: "relation"; links: readonly RecordLink[] }
  /** rollup and formula: the value the export carried, never recomputed. */
  | { kind: "carried"; display: string }
  | { kind: "metadata"; display: string; person?: RecordPerson | null }
  | { kind: "identifier"; display: string };

export type RecordIcon =
  { kind: "emoji"; emoji: string } | { kind: "image"; url: string } | null;

export interface DatabaseRecord {
  id: string;
  title: string;
  icon: RecordIcon;
  /** Values by field id. A missing key and `null` both mean the field is empty. */
  values: Readonly<Record<string, FieldValue | null>>;
  /** Optional stored cover gradient class for the gallery layout. */
  coverClass?: string | null;
  /** `DB-010`: whether this record carries a stored body of blocks. */
  hasBody?: boolean;
}

/** `DB-004` — the six layouts a view takes. */
export type DatabaseLayout =
  "table" | "board" | "list" | "gallery" | "calendar" | "timeline";

export type FilterConjunction = "and" | "or";

export type FilterOperator =
  | "is"
  | "is-not"
  | "contains"
  | "does-not-contain"
  | "is-empty"
  | "is-not-empty"
  | "is-before"
  | "is-after"
  | "is-greater-than"
  | "is-less-than";

export const filterOperatorLabel: Record<FilterOperator, string> = {
  is: "is",
  "is-not": "is not",
  contains: "contains",
  "does-not-contain": "does not contain",
  "is-empty": "is empty",
  "is-not-empty": "is not empty",
  "is-before": "is before",
  "is-after": "is after",
  "is-greater-than": "is greater than",
  "is-less-than": "is less than",
};

export const valuelessFilterOperators: readonly FilterOperator[] = [
  "is-empty",
  "is-not-empty",
];

export interface FilterRule {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterState {
  conjunction: FilterConjunction;
  rules: readonly FilterRule[];
}

export type SortDirection = "ascending" | "descending";

export interface SortRule {
  id: string;
  fieldId: string;
  direction: SortDirection;
}

/** `DB-007` — the calculations a table column carries under it. */
export type CalculationKind =
  | "none"
  | "count"
  | "filled"
  | "empty"
  | "sum"
  | "average"
  | "minimum"
  | "maximum"
  | "range"
  | "percent";

export const calculationLabel: Record<CalculationKind, string> = {
  none: "None",
  count: "Count",
  filled: "Filled",
  empty: "Empty",
  sum: "Sum",
  average: "Average",
  minimum: "Minimum",
  maximum: "Maximum",
  range: "Range",
  percent: "Percent",
};

export const calculationKinds = Object.keys(
  calculationLabel,
) as CalculationKind[];

export interface ColumnCalculation {
  kind: CalculationKind;
  /** The computed result, produced upstream over the view's filtered records. */
  display: string;
}

/** `DB-003` — one saved view over the one set of records. */
export interface DatabaseView {
  id: string;
  name: string;
  layout: DatabaseLayout;
  /** `DB-006`: the field a board or a grouped view groups by. */
  groupFieldId: string | null;
  /** `DB-004`: the date field a calendar or a timeline reads. */
  dateFieldId: string | null;
  filter: FilterState;
  sorts: readonly SortRule[];
  /** `DB-003`: the fields shown, in order. */
  visibleFieldIds: readonly string[];
  /** `DB-006`: hide groups with no records. */
  hideEmptyGroups: boolean;
  /** Per-field calculation shown under a table column (`DB-007`). */
  calculations: Readonly<Record<string, ColumnCalculation>>;
}

/** `DB-006` — one group of records with its count. */
export interface RecordGroup {
  id: string;
  label: string;
  colour: RecordColour;
  count: number;
  records: readonly DatabaseRecord[];
}

/** `DB-009` — the structure lock and who set it. */
export interface DatabaseLock {
  lockedBy: string;
  lockedAt: string;
}

/** One day of a calendar layout. */
export interface CalendarDay {
  /** A stable key, e.g. "2026-03-12". */
  id: string;
  /** The number shown in the corner of the cell. */
  label: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  records: readonly DatabaseRecord[];
}

/** One bar of a timeline layout, positioned by the caller as a percentage. */
export interface TimelineBar {
  record: DatabaseRecord;
  startPercent: number;
  widthPercent: number;
  rangeLabel: string;
}

/** One comment thread on a record (`DB-012`). */
export interface RecordComment {
  id: string;
  author: RecordPerson;
  time: string;
  body: string;
  resolved: boolean;
  replyCount: number;
}

/** One entry of a record's history, newest first (`REV-002`). */
export interface RecordRevision {
  id: string;
  actor: RecordPerson;
  time: string;
  /** How the revision arrived: an edit, an import, an automation, a restore. */
  origin: string;
  /** `REV-007` assigns these only under the labelled version policy. */
  ordinal?: number | null;
  label?: string | null;
}

export type DatabaseSurfaceState = SurfaceState;

/** Capitalises a vocabulary noun at the start of a sentence. */
export function sentenceCase(noun: string): string {
  return noun.charAt(0).toUpperCase() + noun.slice(1);
}

export function findField(
  fields: readonly DatabaseField[],
  fieldId: string | null | undefined,
) {
  if (!fieldId) return undefined;
  return fields.find((field) => field.id === fieldId);
}
