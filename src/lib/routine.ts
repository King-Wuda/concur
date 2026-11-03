/**
 * The rules behind goals and the routine, as pure functions of dates so the
 * pages, the Home card and the tests agree on them.
 *
 * Dates are "YYYY-MM-DD" strings, and "today" is always passed in - the
 * South African today from lib/period - so nothing here depends on the
 * server's clock or time zone.
 */

/** 0 = Sunday ... 6 = Saturday, the same numbering the database stores. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Monday first, the way a week is usually read. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function weekdayOf(date: string): Weekday {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Wednesday 4 November". */
export function formatDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAY_NAMES[weekdayOf(date)]} ${day} ${MONTHS[month - 1]}`;
}

/** "4 Nov 2026". */
export function formatShortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1].slice(0, 3)} ${year}`;
}

const MONTHS = [
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
];

/* -------------------------------------------------------------------------- */
/* The routine                                                                */
/* -------------------------------------------------------------------------- */

export type HabitSchedule = { weekdays: readonly number[] };

export function isDue(habit: HabitSchedule, date: string): boolean {
  return habit.weekdays.includes(weekdayOf(date));
}

/** "Every day", "Weekdays", "Weekends", or "Wed & Sun" / "Mon, Wed & Fri". */
export function describeSchedule(weekdays: readonly number[]): string {
  const days = new Set(weekdays);
  if (days.size === 7) return "Every day";
  const weekdaysOnly = [1, 2, 3, 4, 5];
  if (days.size === 5 && weekdaysOnly.every((d) => days.has(d))) return "Weekdays";
  if (days.size === 2 && days.has(0) && days.has(6)) return "Weekends";
  const names = WEEK_ORDER.filter((d) => days.has(d)).map((d) => WEEKDAY_NAMES[d].slice(0, 3));
  if (names.length === 1) return `Every ${WEEKDAY_NAMES[[...days][0]]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export type Consistency = {
  /** Scheduled days in the window that have already been and gone (or are done). */
  due: number;
  /** Of those, how many were ticked. */
  done: number;
  /** Ticked scheduled days in a row, most recent first. */
  streak: number;
};

/**
 * How consistent a habit has been over the last `windowDays` days, counting
 * only days it was scheduled and only from when it was created.
 *
 * Today counts once it is ticked, but not before: a habit due today is not
 * missed yet at breakfast. Same for the streak - it runs back from today if
 * today is done, otherwise from the last scheduled day before it.
 */
export function consistencyOf(
  habit: HabitSchedule & { created: string },
  ticked: ReadonlySet<string>,
  today: string,
  windowDays = 56,
): Consistency {
  const start = [addDays(today, -(windowDays - 1)), habit.created].sort().at(-1)!;
  let due = 0;
  let done = 0;
  for (let date = start; date <= today; date = addDays(date, 1)) {
    if (!isDue(habit, date)) continue;
    if (date === today && !ticked.has(date)) continue;
    due += 1;
    if (ticked.has(date)) done += 1;
  }

  let streak = 0;
  for (let date = today; date >= habit.created; date = addDays(date, -1)) {
    if (!isDue(habit, date)) continue;
    if (ticked.has(date)) streak += 1;
    else if (date === today) continue;
    else break;
  }

  return { due, done, streak };
}

/**
 * Each scheduled day of the last few weeks and whether it was done: what the
 * little row of dots under a habit draws. Oldest first; today only if due.
 */
export function recentDays(
  habit: HabitSchedule & { created: string },
  ticked: ReadonlySet<string>,
  today: string,
  count = 8,
): { date: string; state: "done" | "missed" | "today" }[] {
  const days: { date: string; state: "done" | "missed" | "today" }[] = [];
  for (let date = today; days.length < count && date >= habit.created; date = addDays(date, -1)) {
    if (!isDue(habit, date)) continue;
    const state = ticked.has(date) ? "done" : date === today ? "today" : "missed";
    days.push({ date, state });
  }
  return days.reverse();
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

export type DeadlineStatus =
  | { kind: "open" }
  | { kind: "upcoming"; daysLeft: number }
  | { kind: "today" }
  | { kind: "overdue"; daysOver: number };

export function deadlineStatus(deadline: string | null, today: string): DeadlineStatus {
  if (!deadline) return { kind: "open" };
  const daysLeft = daysBetween(today, deadline);
  if (daysLeft === 0) return { kind: "today" };
  if (daysLeft < 0) return { kind: "overdue", daysOver: -daysLeft };
  return { kind: "upcoming", daysLeft };
}

/** "3 days left", "2 weeks left", "5 months left"; "Due today"; "Overdue by 4 days". */
export function describeDeadline(status: DeadlineStatus): string {
  switch (status.kind) {
    case "open":
      return "Open-ended";
    case "today":
      return "Due today";
    case "overdue":
      return `Overdue by ${spanOf(status.daysOver)}`;
    case "upcoming":
      return `${spanOf(status.daysLeft)} left`;
  }
}

function spanOf(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 61) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
}

/** Milestones done out of the total, and the share as a whole percentage. */
export function milestoneProgress(milestones: readonly { done_at: string | null }[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = milestones.length;
  const done = milestones.filter((m) => m.done_at !== null).length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/**
 * Moves the item at `index` by `by` places and returns the new order. Used for
 * goal priority, where only the order matters: positions are rewritten 0..n.
 */
export function reorder<T>(items: readonly T[], index: number, by: number): T[] {
  const target = index + by;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/* -------------------------------------------------------------------------- */
/* Times and categories                                                       */
/* -------------------------------------------------------------------------- */

/** Categories offered when adding a habit or goal; any other word works too. */
export const SUGGESTED_CATEGORIES = [
  "Fitness",
  "Mindset",
  "Faith",
  "Self-care",
  "Home",
  "Personal",
  "Work",
  "Career",
  "Learning",
  "Admin",
] as const;

/** "05:00:00" or "05:00" -> "05:00"; null stays null. */
export function shortTime(time: string | null | undefined): string | null {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** "05:00–07:00", "07:00" (no end), or null when no time is set. */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  const from = shortTime(start);
  if (!from) return null;
  const to = shortTime(end);
  return to ? `${from}–${to}` : from;
}

/**
 * The day's order: by start time, earliest first; things with no time set
 * come after, in the order they were added.
 */
export function byTime<T extends { start_time: string | null; position: number }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const at = shortTime(a.start_time);
    const bt = shortTime(b.start_time);
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    if (at && !bt) return -1;
    if (!at && bt) return 1;
    return a.position - b.position;
  });
}

/** "15 Oct – 16 Oct 2026" for a focus block, or just the deadline. */
export function formatDateSpan(start: string | null, end: string | null): string | null {
  if (start && end) {
    const [sy, sm, sd] = start.split("-").map(Number);
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const from = `${sd} ${MONTHS[sm - 1].slice(0, 3)}${sameYear ? "" : ` ${sy}`}`;
    return `${from} – ${formatShortDate(end)}`;
  }
  if (end) return `by ${formatShortDate(end)}`;
  if (start) return `from ${formatShortDate(start)}`;
  return null;
}
