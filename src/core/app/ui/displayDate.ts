import { createElement, useSyncExternalStore } from "react";

/** The editable access-expiry field keeps its strict, round-trippable local form. */
export function displayDate(value: string, withTime = false) {
  return fullDate(value, withTime);
}
function instant(value: string | number) { return new Date(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value); }
export function fullDate(value: string, withTime = true, timeZone?: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (dateOnly) timeZone = "UTC";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", ...(withTime && !dateOnly ? { hour: "2-digit", minute: "2-digit" } as const : {}), timeZone }).format(instant(value));
}
/** Short absolute form for prose, options and tooltips; DateStamp also supplies recent relative times. */
export function shortDate(value: string | number, _withTime = false, now = new Date(), timeZone?: string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) timeZone = "UTC";
  const date = instant(value);
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone });
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", ...(year.format(date) !== year.format(now) ? {year: "numeric"} as const : {}), timeZone }).format(date);
}
export function relativeDate(value: string, now = new Date()) {
  const date = instant(value), elapsed = now.getTime() - date.getTime();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) && elapsed >= 0) {
    if (elapsed < 60_000) return "Just now";
    if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} h ago`;
  }
  return shortDate(value, false, now);
}
const subscribe = () => () => {};
/** Text-only contexts such as option labels hydrate with the same absolute UTC form. */
export function useDateText() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (value: string | number, full = false) => {
    const normalized = typeof value === "number" ? new Date(value).toISOString() : value;
    return full ? fullDate(normalized, true, mounted ? undefined : "UTC") : mounted ? relativeDate(normalized) : shortDate(normalized, false, new Date(), "UTC");
  };
}
/** UTC absolute text hydrates identically; the browser's local relative text starts after hydration. */
export function DateStamp({ value, className }: { value: string; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return createElement("time", { dateTime: value, title: fullDate(value, true, mounted ? undefined : "UTC"), className }, mounted ? relativeDate(value) : shortDate(value, false, new Date(), "UTC"));
}
export function dateGroup(day: string, timeZone: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return day === today ? "Today" : shortDate(day);
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
