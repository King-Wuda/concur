import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PLAN, exerciseKey, type LoggedSet, type Scheme } from "@/lib/workouts";

/**
 * Database access for workouts. Like the budget side, every query goes through
 * the caller's request-scoped client, so row level security applies.
 */

type DB = SupabaseClient;

export type WorkoutExerciseRow = {
  id: string;
  day_id: string;
  name: string;
  scheme: Scheme;
  sets: number;
  position: number;
};

export type WorkoutDayRow = {
  id: string;
  code: string;
  name: string;
  focus: string | null;
  position: number;
  exercises: WorkoutExerciseRow[];
};

export type WorkoutSetRow = LoggedSet & {
  id: string;
  session_id: string;
  exercise_name: string;
  scheme: Scheme;
  position: number;
};

export type WorkoutSessionRow = {
  id: string;
  day_id: string | null;
  day_code: string;
  day_name: string;
  date: string;
  notes: string | null;
  created_at: string;
  sets: WorkoutSetRow[];
};

/** The last time an exercise was done: its date and the sets, in order. */
export type LastTime = { date: string; sets: LoggedSet[] };

/** Thrown when migration 0006 has not been run, so a page can say so plainly. */
export class WorkoutsNotSetUpError extends Error {
  constructor() {
    super("Run supabase/migrations/0006_workouts.sql in the Supabase SQL editor to set up Workouts.");
  }
}

function isMissingTable(error: { code?: string } | null): boolean {
  // 42P01: Postgres "undefined table". PGRST205: PostgREST cannot find it.
  return error?.code === "42P01" || error?.code === "PGRST205";
}

const DAY_COLUMNS =
  "id, code, name, focus, position, workout_exercises (id, day_id, name, scheme, sets, position)";

type RawDay = Omit<WorkoutDayRow, "exercises"> & { workout_exercises: WorkoutExerciseRow[] };

function shapeDays(rows: RawDay[]): WorkoutDayRow[] {
  return rows
    .map(({ workout_exercises, ...day }) => ({
      ...day,
      exercises: [...(workout_exercises ?? [])].sort((a, b) => a.position - b.position),
    }))
    .sort((a, b) => a.position - b.position);
}

/**
 * The training plan, seeded from the original spreadsheet the first time it is
 * asked for. Never re-seeds once any day exists, so an edited plan stays as
 * edited.
 */
export async function ensurePlan(supabase: DB, userId: string): Promise<WorkoutDayRow[]> {
  const existing = await supabase.from("workout_days").select(DAY_COLUMNS).eq("user_id", userId);
  if (isMissingTable(existing.error)) throw new WorkoutsNotSetUpError();
  if (existing.error) throw existing.error;
  if ((existing.data ?? []).length > 0) return shapeDays(existing.data as unknown as RawDay[]);

  for (const [position, day] of DEFAULT_PLAN.entries()) {
    const inserted = await supabase
      .from("workout_days")
      .insert({ user_id: userId, code: day.code, name: day.name, focus: day.focus, position })
      .select("id")
      .single();
    // Another request seeded it first: fall through and read what is there.
    if (inserted.error) break;

    const exercises = await supabase.from("workout_exercises").insert(
      day.exercises.map((exercise, index) => ({
        user_id: userId,
        day_id: inserted.data.id,
        name: exercise.name,
        scheme: exercise.scheme,
        sets: exercise.sets,
        position: index,
      })),
    );
    if (exercises.error) throw exercises.error;
  }

  const seeded = await supabase.from("workout_days").select(DAY_COLUMNS).eq("user_id", userId);
  if (seeded.error) throw seeded.error;
  return shapeDays(seeded.data as unknown as RawDay[]);
}

/** Logged sessions, newest first, each with its sets in the order they were done. */
export async function listSessions(
  supabase: DB,
  userId: string,
  limit = 60,
): Promise<WorkoutSessionRow[]> {
  const { data, error } = await supabase
    .from("workout_sessions")
    .select(
      "id, day_id, day_code, day_name, date, notes, created_at," +
        " workout_sets (id, session_id, exercise_name, scheme, set_number, target, weight_kg, reps, position)",
    )
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (isMissingTable(error)) throw new WorkoutsNotSetUpError();
  if (error) throw error;

  type RawSession = Omit<WorkoutSessionRow, "sets"> & { workout_sets: WorkoutSetRow[] };
  return ((data ?? []) as unknown as RawSession[]).map(({ workout_sets, ...session }) => ({
    ...session,
    sets: [...(workout_sets ?? [])]
      .map((set) => ({ ...set, weight_kg: set.weight_kg === null ? null : Number(set.weight_kg) }))
      .sort((a, b) => a.position - b.position),
  }));
}

/**
 * The most recent time each exercise was done, keyed by exerciseKey(name), from
 * sessions given newest first. An exercise that appears on several days -
 * lateral raises are in all three - takes whichever day was most recent.
 */
export function lastTimes(sessions: readonly WorkoutSessionRow[]): Record<string, LastTime> {
  const result: Record<string, LastTime> = {};
  for (const session of sessions) {
    const byExercise = new Map<string, LoggedSet[]>();
    for (const set of session.sets) {
      const key = exerciseKey(set.exercise_name);
      if (key in result) continue;
      byExercise.set(key, [
        ...(byExercise.get(key) ?? []),
        { set_number: set.set_number, target: set.target, weight_kg: set.weight_kg, reps: set.reps },
      ]);
    }
    for (const [key, sets] of byExercise) {
      result[key] = { date: session.date, sets: sets.sort((a, b) => a.set_number - b.set_number) };
    }
  }
  return result;
}
