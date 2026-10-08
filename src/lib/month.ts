/**
 * Months are identified in the URL and API by a "YYYY-MM" key and stored in
 * Postgres as the first day of that month.
 */

export type MonthKey = string; // "YYYY-MM"

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_KEY_RE.test(value);
}

/** "2026-09" -> "2026-09-01" (the `months.month` column value). */
export function monthKeyToDate(key: MonthKey): string {
  return `${key}-01`;
}

/** "2026-09-01" (or a full timestamp) -> "2026-09". */
export function dateToMonthKey(date: string): MonthKey {
  return date.slice(0, 7);
}

/** The current month in the browser's / server's local time. */
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Shifts a month key by `delta` months. shiftMonth("2026-01", -1) === "2025-12". */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const [year, month] = key.split("-").map(Number);
  const zeroBased = (year * 12 + (month - 1)) + delta;
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/**
 * Month names are spelled out here rather than fetched from `toLocaleString`,
 * for the same reason amounts are formatted by hand in lib/money.ts: Node and
 * the browser ship different ICU data, and the two must agree exactly or
 * hydration fails.
 */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "2026-09" -> "September 2026". */
export function formatMonthLong(key: MonthKey): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1] ?? key} ${year}`;
}

/** "2026-09" -> "Sep 2026". */
export function formatMonthShort(key: MonthKey): string {
  const [year, month] = key.split("-").map(Number);
  return `${(MONTH_NAMES[month - 1] ?? key).slice(0, 3)} ${year}`;
}

/**
 * A sensible default date for something entered by hand into `key`'s month:
 * today when today falls inside it, otherwise the first of the month. Someone
 * typing an expense is usually recording what they just spent, but may be
 * catching up on a month that has already ended.
 */
export function defaultDateInMonth(key: MonthKey, now: Date = new Date()): string {
  if (currentMonthKey(now) !== key) return monthKeyToDate(key);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Falls back to today's month for missing or malformed input. */
export function normaliseMonthKey(value: unknown): MonthKey {
  return isMonthKey(value) ? value : currentMonthKey();
}

/**
 * True for a real calendar date written as YYYY-MM-DD. The shape alone is not
 * enough once the date decides which month something is filed under: a regex
 * happily accepts 2026-13-45, which would then name a month that does not exist.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
