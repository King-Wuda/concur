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

/** Falls back to today's month for missing or malformed input. */
export function normaliseMonthKey(value: unknown): MonthKey {
  return isMonthKey(value) ? value : currentMonthKey();
}

/** Clamps an ISO date to the given month, so a receipt can't land elsewhere. */
export function clampDateToMonth(isoDate: string, key: MonthKey): string {
  if (isMonthKey(dateToMonthKey(isoDate)) && dateToMonthKey(isoDate) === key) {
    return isoDate;
  }
  return monthKeyToDate(key);
}
