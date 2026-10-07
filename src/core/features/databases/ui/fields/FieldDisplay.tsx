import type { ReactNode } from "react";
import type { DatabaseField, FieldValue } from "../types";
import { CheckboxField } from "./CheckboxField";
import { DateField } from "./DateField";
import { FileField } from "./FileField";
import { FormulaField } from "./FormulaField";
import { LinkField } from "./LinkField";
import { MetadataField } from "./MetadataField";
import { NumberField } from "./NumberField";
import { OptionsField } from "./OptionsField";
import { PersonField } from "./PersonField";
import type { FieldDensity } from "./props";
import { RelationField } from "./RelationField";
import { RollupField } from "./RollupField";
import { TextField } from "./TextField";

/** The read view of a stored value: one renderer per field family (`DB-002`). */
export function FieldDisplay({
  field,
  value,
  density,
  onOpenLink,
}: {
  field: DatabaseField;
  value: FieldValue | null;
  density: FieldDensity;
  onOpenLink?: (linkId: string) => void;
}): ReactNode {
  const shared = { field, value, editable: false } as const;
  switch (field.type) {
    case "text":
    case "place":
      return <TextField {...shared} />;
    case "number":
      return <NumberField {...shared} />;
    case "checkbox":
      return <CheckboxField {...shared} />;
    case "date":
      return <DateField {...shared} />;
    case "select":
    case "multi-select":
    case "status":
      return <OptionsField {...shared} />;
    case "person":
      return <PersonField {...shared} />;
    case "file":
      return <FileField {...shared} />;
    case "url":
    case "email":
    case "phone":
      return <LinkField {...shared} />;
    case "relation":
      return <RelationField {...shared} onOpenLink={onOpenLink} />;
    case "rollup":
      return <RollupField {...shared} density={density} />;
    case "formula":
      return <FormulaField {...shared} density={density} />;
    default:
      return <MetadataField {...shared} />;
  }
}
