import {
  AtSign,
  Barcode,
  Calendar,
  CalendarClock,
  CalendarPlus,
  CircleChevronDown,
  CircleDashed,
  Combine,
  Hash,
  Link,
  type LucideIcon,
  MapPin,
  Paperclip,
  Phone,
  Sigma,
  SquareCheck,
  Tags,
  Type,
  User,
  UserPen,
  UserPlus,
  Waypoints,
} from "lucide-react";
import { cn } from "../../../../ui";
import type { DatabaseFieldType } from "../types";

/** `DB-002` — one recognisable glyph per stored field type. */
const fieldTypeGlyph: Record<DatabaseFieldType, LucideIcon> = {
  text: Type,
  number: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  select: CircleChevronDown,
  "multi-select": Tags,
  status: CircleDashed,
  person: User,
  file: Paperclip,
  url: Link,
  email: AtSign,
  phone: Phone,
  place: MapPin,
  relation: Waypoints,
  rollup: Combine,
  formula: Sigma,
  "created-time": CalendarPlus,
  "created-by": UserPlus,
  "updated-time": CalendarClock,
  "updated-by": UserPen,
  identifier: Barcode,
};

/** The accessible, human name of each field type, for headers and pickers. */
export const fieldTypeLabel: Record<DatabaseFieldType, string> = {
  text: "Text",
  number: "Number",
  checkbox: "Checkbox",
  date: "Date",
  select: "Select",
  "multi-select": "Multi-select",
  status: "Status",
  person: "Person",
  file: "File",
  url: "URL",
  email: "Email",
  phone: "Phone",
  place: "Place",
  relation: "Relation",
  rollup: "Rollup",
  formula: "Formula",
  "created-time": "Created time",
  "created-by": "Created by",
  "updated-time": "Updated time",
  "updated-by": "Updated by",
  identifier: "Identifier",
};

/**
 * The small type mark a column header or a detail row carries before the field
 * name. Decorative: the accessible type name is `fieldTypeLabel`, which the
 * surrounding control puts in its own accessible name.
 */
export function FieldGlyph({ type, className }: { type: DatabaseFieldType; className?: string }) {
  const Glyph = fieldTypeGlyph[type];
  return <Glyph aria-hidden="true" className={cn("size-3.5 shrink-0 text-ink-faint", className)} />;
}
