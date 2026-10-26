/** One locale and date order for displayed dates and editable access expiry. */
export function displayDate(value: string, withTime = false, timeZone?: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(value));
}
export function dateGroup(day: string, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return day === today ? "Today" : displayDate(`${day}T12:00:00`);
}
export function parseAccessExpiry(text: string): string | null | undefined {
  if (!text.trim()) return null;
  const match = text.trim().match(/^(\d{2}) ([A-Za-z]{3,4}) (\d{4}),? (\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[2]!.toLowerCase() === "sept" ? "sep" : match[2]!.toLowerCase());
  const day = Number(match[1]), year = Number(match[3]), hour = Number(match[4]), minute = Number(match[5]);
  if (month < 0 || year < 1000 || hour > 23 || minute > 59) return undefined;
  const date = new Date(year, month, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day && date.getHours() === hour && date.getMinutes() === minute ? date.toISOString() : undefined;
}
