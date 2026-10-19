import { ApiProblem } from "../../app/problems";
import { localDate, scheduleAt, validTimezone } from "../work-items/time";
/**
 * A record template's calendar schedule (DB-015). Times are wall-clock times in the schedule's time zone.
 * A monthly or yearly day past the end of a shorter month runs on that month's last day; a time skipped by a
 * daylight-saving change runs one hour later that day.
 */
export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  time: string;
  /** Weekly: days of the week, 0 = Sunday. */
  weekdays?: number[];
  /** Monthly and yearly: day of the month, 1-31. */
  dayOfMonth?: number;
  /** Yearly: month, 1-12. */
  month?: number;
}
const DAY = 86400000;
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const invalid = (message: string) => new ApiProblem(400, "INVALID_RECURRENCE", message);
export function validateRecurrence(value: unknown): Recurrence {
  const r = value as Recurrence;
  if (!r || typeof r !== "object" || !["daily", "weekly", "monthly", "yearly"].includes(r.frequency))
    throw invalid("Choose daily, weekly, monthly or yearly.");
  if (typeof r.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) throw invalid("Choose a time as HH:MM.");
  const out: Recurrence = { frequency: r.frequency, time: r.time };
  if (r.frequency === "weekly") {
    const days = r.weekdays;
    if (!Array.isArray(days) || !days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(days).size !== days.length)
      throw invalid("Choose at least one day of the week.");
    out.weekdays = [...days].sort();
  }
  if (r.frequency === "monthly" || r.frequency === "yearly") {
    if (!Number.isInteger(r.dayOfMonth) || r.dayOfMonth! < 1 || r.dayOfMonth! > 31) throw invalid("Choose a day of the month from 1 to 31.");
    out.dayOfMonth = r.dayOfMonth;
  }
  if (r.frequency === "yearly") {
    if (!Number.isInteger(r.month) || r.month! < 1 || r.month! > 12) throw invalid("Choose a month.");
    if (r.dayOfMonth! > daysIn(2024, r.month!)) throw invalid("That month never has this day.");
    out.month = r.month;
  }
  return out;
}
function onDay(r: Recurrence, date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (r.frequency === "daily") return true;
  if (r.frequency === "weekly") return r.weekdays!.includes(new Date(Date.UTC(year, month - 1, day)).getUTCDay());
  if (r.frequency === "yearly" && month !== r.month) return false;
  return day === Math.min(r.dayOfMonth!, daysIn(year, month));
}
function wallTime(date: string, time: string, timezone: string) {
  try {
    return scheduleAt(date, time, timezone);
  } catch (error) {
    if (!(error instanceof ApiProblem)) throw error;
    const [h, m] = time.split(":").map(Number);
    return scheduleAt(date, `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`, timezone);
  }
}
/** The first occurrence strictly after `after`. */
export function nextOccurrence(r: Recurrence, timezone: string, after: string) {
  if (!validTimezone(timezone)) throw invalid("Unknown time zone.");
  const start = Date.parse(`${localDate(after, timezone)}T00:00:00Z`);
  for (let i = 0; i < 800; i++) {
    const date = new Date(start + i * DAY).toISOString().slice(0, 10);
    if (!onDay(r, date)) continue;
    const at = wallTime(date, r.time, timezone);
    if (at > after) return at;
  }
  throw invalid("This schedule has no next occurrence.");
}
