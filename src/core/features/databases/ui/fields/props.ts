import type { DatabaseField, FieldValue } from "../types";

/** Where a field is being rendered: a grid cell, or the record detail. */
export type FieldDensity = "cell" | "detail";

/**
 * The one shape every field renderer takes. Values arrive already formatted
 * upstream (`FieldValue` carries display strings) so no renderer computes,
 * formats or invents anything.
 */
export interface FieldRendererProps {
  field: DatabaseField;
  /** `null` is the field's empty value. */
  value: FieldValue | null;
  /** Already resolved by the caller: `DB-012` shows a field it may not edit. */
  editable: boolean;
  onValueChange?: (fieldId: string, next: FieldValue | null) => void;
  onEdit?: (fieldId: string) => void;
}
