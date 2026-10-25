/**
 * The training plan's rules, as pure functions so the log screen, history and
 * tests all agree on them.
 *
 * Two set schemes, straight from the original spreadsheet:
 *
 * - RPT, reverse pyramid: heaviest first, then lighter for more reps. Three
 *   sets aiming 4-6, then 6-8, then 8-10.
 * - RP, rest-pause: one set of 10-15, then short sets of 4-6 on the same
 *   weight with little rest.
 *
 * And one rule for progressing: hit the top of the rep range on every set
 * before increasing the weight.
 */

export type Scheme = "RPT" | "RP";
export const SCHEMES: readonly Scheme[] = ["RPT", "RP"];

export const SCHEME_LABELS: Record<Scheme, string> = {
  RPT: "Reverse pyramid",
  RP: "Rest-pause",
};

export const SCHEME_RULES =
  "RPT = 3 sets: aim 4-6, then 6-8, then 8-10 reps. RP = 5 sets: aim 10-15, then 4-6 on the rest.";
export const PROGRESSION_RULE =
  "Hit the top of the rep range on every set before increasing the weight.";

export type RepRange = { min: number; max: number; label: string };

const range = (min: number, max: number): RepRange => ({ min, max, label: `${min}-${max}` });

/** What set `setNumber` (1-based) of an exercise aims for. */
export function targetFor(scheme: Scheme, setNumber: number): RepRange {
  if (scheme === "RP") return setNumber === 1 ? range(10, 15) : range(4, 6);
  if (setNumber === 1) return range(4, 6);
  if (setNumber === 2) return range(6, 8);
  return range(8, 10);
}

/** "4-6" back to a range, for sets logged with the target they had then. */
export function parseTarget(label: string): RepRange | null {
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(label.trim());
  return match ? range(Number(match[1]), Number(match[2])) : null;
}

export type PlanExercise = { name: string; scheme: Scheme; sets: number };
export type PlanDay = { code: string; name: string; focus: string; exercises: PlanExercise[] };

const rpt = (name: string, sets = 3): PlanExercise => ({ name, scheme: "RPT", sets });
const rp = (name: string, sets = 5): PlanExercise => ({ name, scheme: "RP", sets });

/** The A/B/C plan from Workout_Tracker_A_B_C_1_Week.xlsx, used to seed a new account. */
export const DEFAULT_PLAN: readonly PlanDay[] = [
  {
    code: "A",
    name: "Workout A",
    focus: "Chest heavy → medium arms/shoulders",
    exercises: [
      rpt("Incline bench"),
      rpt("Barbell bench"),
      rp("Dumbbell curls"),
      rp("Triceps rope pushdown"),
      rp("Lateral raises"),
      rp("Side delt rows"),
    ],
  },
  {
    code: "B",
    name: "Workout B",
    focus: "Lower back / legs heavy → medium arms/shoulders",
    exercises: [
      rpt("Squat", 2),
      rpt("Deadlift / Romanian deadlift"),
      rp("Barbell shrugs"),
      rpt("Weighted dips"),
      rp("Dumbbell hammer curls"),
      rp("Triceps rope pushdown"),
      rp("Lateral raises"),
      rp("Side delt rows"),
    ],
  },
  {
    code: "C",
    name: "Workout C",
    focus: "Heavy shoulders → medium arms",
    exercises: [
      rpt("Overhead shoulder press"),
      rpt("Weighted pull ups"),
      rp("Barbell rows"),
      rp("Chest flies", 3),
      rp("Seated incline dumbbell curls"),
      rp("Lateral raises"),
      rp("Side delt rows"),
    ],
  },
];

/**
 * Which day comes next in the rotation: the one after the last day trained,
 * wrapping round, or the first if nothing has been logged (or the last day
 * trained has since left the plan).
 */
export function nextDayCode(
  codesInOrder: readonly string[],
  lastTrained: string | null,
): string | null {
  if (codesInOrder.length === 0) return null;
  const index = lastTrained ? codesInOrder.indexOf(lastTrained) : -1;
  return codesInOrder[(index + 1) % codesInOrder.length];
}

export type LoggedSet = {
  set_number: number;
  target: string;
  weight_kg: number | null;
  reps: number;
};

export type Progress =
  | { kind: "new" }
  | { kind: "increase" }
  | { kind: "hold"; short: number[] };

/**
 * Whether an exercise is ready for more weight, judged on the last time it was
 * done: every planned set has to have been done, at the top of its range.
 * `short` lists the sets that fell short (or were skipped), 1-based.
 */
export function progressFor(
  scheme: Scheme,
  plannedSets: number,
  lastTime: readonly LoggedSet[],
): Progress {
  if (lastTime.length === 0) return { kind: "new" };

  const short: number[] = [];
  for (let setNumber = 1; setNumber <= plannedSets; setNumber += 1) {
    const done = lastTime.find((set) => set.set_number === setNumber);
    const top = (done && parseTarget(done.target)?.max) ?? targetFor(scheme, setNumber).max;
    if (!done || done.reps < top) short.push(setNumber);
  }
  return short.length === 0 ? { kind: "increase" } : { kind: "hold", short };
}

/** "60 kg × 6", "× 12" for bodyweight. */
export function formatSet(set: Pick<LoggedSet, "weight_kg" | "reps">): string {
  const weight = set.weight_kg === null || set.weight_kg === undefined ? null : Number(set.weight_kg);
  const reps = `× ${set.reps}`;
  return weight === null ? reps : `${formatKg(weight)} kg ${reps}`;
}

export function formatKg(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : String(Math.round(weight * 100) / 100);
}

/** The same exercise across days ("Lateral raises" is in A, B and C) shares history. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
