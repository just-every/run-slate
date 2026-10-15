import { displayDate } from "../app/ui/displayDate";

/** Calendar-only values have no timezone; timestamps use the viewer's timezone. */
export function recordDateTime(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
}

export function recordDate(value: string): string {
  return displayDate(recordDateTime(value).toISOString());
}

/** The local calendar day for a date input, without slicing a UTC timestamp. */
export function recordDateInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = recordDateTime(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
