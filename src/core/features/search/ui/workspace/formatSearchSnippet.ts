import { recordDate } from "../../../../client/recordDates";

/** Date strings are presented in the viewer's timezone, after search and clipping. */
export function formatSearchSnippet(value: string): string {
  return value.replace(
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?\b/g,
    date => Number.isFinite(Date.parse(date)) ? recordDate(date) : date,
  );
}
