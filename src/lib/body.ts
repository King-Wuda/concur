/**
 * The daily body log: morning weight and the day's steps.
 *
 * Day-to-day weight jumps around by a kilo or more with water and food, so the
 * number worth watching is the 7-day average; the chart draws both.
 */

export type BodyLog = { date: string; weight_kg: number | null; steps: number | null };

/**
 * For each logged day, the average of the weights logged in the 7 days ending
 * that day (calendar days, so a missed morning just has fewer to average).
 * Oldest first, like the chart.
 */
export function withWeightAverage(
  logs: readonly BodyLog[],
): (BodyLog & { weight_avg: number | null })[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((log) => {
    const from = shift(log.date, -6);
    const window = sorted.filter(
      (other) => other.date >= from && other.date <= log.date && other.weight_kg !== null,
    );
    const avg =
      window.length === 0
        ? null
        : Math.round((window.reduce((acc, o) => acc + Number(o.weight_kg), 0) / window.length) * 10) /
          10;
    return { ...log, weight_avg: avg };
  });
}

/** Average weight this week against the week before, if both have entries. */
export function weeklyChange(logs: readonly BodyLog[], today: string): number | null {
  const avg = (from: string, to: string) => {
    const values = logs
      .filter((l) => l.date >= from && l.date <= to && l.weight_kg !== null)
      .map((l) => Number(l.weight_kg));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const thisWeek = avg(shift(today, -6), today);
  const lastWeek = avg(shift(today, -13), shift(today, -7));
  if (thisWeek === null || lastWeek === null) return null;
  return Math.round((thisWeek - lastWeek) * 10) / 10;
}

/** Average daily steps over the last `days` days that have a step count. */
export function averageSteps(logs: readonly BodyLog[], today: string, days = 7): number | null {
  const values = logs
    .filter((l) => l.date > shift(today, -days) && l.date <= today && l.steps !== null)
    .map((l) => Number(l.steps));
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

/** "9 500", grouped by hand like amounts elsewhere so server and browser agree. */
export function formatSteps(steps: number): string {
  return String(Math.round(steps)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function shift(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Days in a row the step goal was hit, ending today if today already counts,
 * otherwise ending yesterday - tonight's steps are not missed until tomorrow.
 */
export function stepStreak(logs: readonly BodyLog[], goal: number, today: string): number {
  const hit = new Set(
    logs.filter((log) => log.steps !== null && log.steps >= goal).map((log) => log.date),
  );
  let day = hit.has(today) ? today : shift(today, -1);
  let streak = 0;
  while (hit.has(day)) {
    streak += 1;
    day = shift(day, -1);
  }
  return streak;
}

/** Of the last `days` days before today that have steps logged, how many hit the goal. */
export function stepGoalHits(
  logs: readonly BodyLog[],
  goal: number,
  today: string,
  days = 7,
): { hit: number; logged: number } {
  const recent = logs.filter(
    (log) => log.steps !== null && log.date <= today && log.date > shift(today, -days),
  );
  return { hit: recent.filter((log) => log.steps! >= goal).length, logged: recent.length };
}
