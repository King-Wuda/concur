import { MONTH_NAMES, shiftMonth, type MonthKey } from "@/lib/month";

/**
 * Budget months run payday to payday.
 *
 * Salary lands on the 24th, and that is when the next month's budget begins:
 * "October" runs from the day salary arrives in September to the day before it
 * arrives in October. Spending on 25 September is October's spending, because
 * it comes out of the salary paid on the 24th.
 *
 * Payday is the 24th unless a month says otherwise - when the 24th falls on a
 * weekend and salary arrives on the Friday before, say. An override applies to
 * that one month only: an early payday in September says nothing about
 * October's.
 *
 * Everything here is a pure function of the months' stored paydays, so the
 * server (which files each receipt) and the browser (which shows where it will
 * go before it is saved) cannot disagree.
 */

export const DEFAULT_PAYDAY = 24;

/** What a month row says about its payday. Null means the usual one. */
export type MonthStart = { month: MonthKey; periodStart: string | null };

/** A budget month's span. Both ends inclusive, as YYYY-MM-DD. */
export type Period = { start: string; end: string };

function daysIn(key: MonthKey): number {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateIn(key: MonthKey, day: number): string {
  return `${key}-${String(Math.min(day, daysIn(key))).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** The payday that starts budget month `key`. */
export function paydayFor(key: MonthKey, starts: readonly MonthStart[]): string {
  const explicit = starts.find((s) => s.month === key)?.periodStart;
  return explicit ?? dateIn(shiftMonth(key, -1), DEFAULT_PAYDAY);
}

/** From this month's payday to the day before next month's. */
export function periodFor(key: MonthKey, starts: readonly MonthStart[]): Period {
  return {
    start: paydayFor(key, starts),
    end: addDays(paydayFor(shiftMonth(key, 1), starts), -1),
  };
}

/** The budget month a date's spending belongs to. */
export function budgetMonthFor(date: string, starts: readonly MonthStart[]): MonthKey {
  const calendar = date.slice(0, 7);
  // After payday it is next month's money; before it, this month's. The two
  // outer candidates only matter if an override sits unusually far out.
  for (const candidate of [
    shiftMonth(calendar, 1),
    calendar,
    shiftMonth(calendar, -1),
    shiftMonth(calendar, 2),
  ]) {
    const { start, end } = periodFor(candidate, starts);
    if (start <= date && date <= end) return candidate;
  }
  return calendar;
}

/**
 * A sensible date to pre-fill for something entered into budget month `key`:
 * today while that month is running, otherwise its last day if it is over, or
 * its first if it has not started.
 */
export function defaultDateIn(
  key: MonthKey,
  starts: readonly MonthStart[],
  today: string = todayInSouthAfrica(),
): string {
  const { start, end } = periodFor(key, starts);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}

/**
 * Today's date where the budget is being kept. Servers run on UTC, and for two
 * hours after midnight on payday UTC still says it is the 23rd - which would
 * open the old month on the morning the new one starts.
 */
export function todayInSouthAfrica(now: Date = new Date()): string {
  // Johannesburg has no daylight saving: it is always UTC+2.
  return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "24 Sep – 23 Oct", or with years when the span crosses one. */
export function formatPeriod({ start, end }: Period): string {
  const part = (iso: string, withYear: boolean) => {
    const [year, month, day] = iso.split("-").map(Number);
    return `${day} ${MONTH_NAMES[month - 1].slice(0, 3)}${withYear ? ` ${year}` : ""}`;
  };
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${part(start, crossesYear)} – ${part(end, crossesYear)}`;
}

/**
 * Why a payday cannot start budget month `key`, or null if it can. It has to
 * land after the previous month's payday and before the next one, or two
 * months would overlap or leave a gap with nowhere to file a receipt.
 */
export function paydayProblem(
  key: MonthKey,
  payday: string,
  starts: readonly MonthStart[],
): string | null {
  const earliest = `${shiftMonth(key, -1)}-01`;
  const latest = dateIn(key, daysIn(key));
  if (payday < earliest || payday > latest) {
    return "Payday for this budget has to fall in the month before it or the month itself.";
  }
  const others = starts.filter((s) => s.month !== key);
  if (payday <= paydayFor(shiftMonth(key, -1), others)) {
    return "That is on or before the previous month's payday.";
  }
  if (payday >= paydayFor(shiftMonth(key, 1), others)) {
    return "That is on or after next month's payday.";
  }
  return null;
}
