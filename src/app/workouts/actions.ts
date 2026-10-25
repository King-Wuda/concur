"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { isIsoDate } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import { SCHEMES } from "@/lib/workouts";

/**
 * Every write the Workouts section makes. As on the budget side, each one
 * re-reads the session and row level security backs it up.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

const SchemeSchema = z.enum(SCHEMES as [string, ...string[]]);
const DateSchema = z.string().refine(isIsoDate, "Expected a real date like 2026-10-25");

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Sign in again.");
  return { supabase, userId: user.id };
}

function failure(error: unknown): { ok: false; error: string } {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong.";
  return { ok: false, error: message };
}

function revalidateWorkouts() {
  revalidatePath("/");
  revalidatePath("/workouts", "layout");
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

const SessionInput = z.object({
  dayId: z.string().uuid(),
  date: DateSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        scheme: SchemeSchema,
        sets: z
          .array(
            z.object({
              set_number: z.number().int().min(1).max(10),
              target: z.string().trim().min(1).max(20),
              weight_kg: z.number().finite().min(0).max(1000).nullable(),
              reps: z.number().int().min(0).max(200),
            }),
          )
          .max(10),
      }),
    )
    .max(30),
});

export type SessionInput = z.input<typeof SessionInput>;

/** Saves a finished workout. Exercises with no sets logged are left out. */
export async function saveSession(raw: SessionInput): Promise<ActionResult<{ id: string }>> {
  try {
    const input = SessionInput.parse(raw);
    const done = input.exercises.filter((exercise) => exercise.sets.length > 0);
    if (done.length === 0) {
      return { ok: false, error: "Log at least one set before saving." };
    }

    const { supabase, userId } = await session();
    const day = await supabase
      .from("workout_days")
      .select("id, code, name")
      .eq("id", input.dayId)
      .eq("user_id", userId)
      .single();
    if (day.error) throw day.error;

    const inserted = await supabase
      .from("workout_sessions")
      .insert({
        user_id: userId,
        day_id: day.data.id,
        day_code: day.data.code,
        day_name: day.data.name,
        date: input.date,
        notes: input.notes || null,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const sessionId = inserted.data.id as string;

    let position = 0;
    const rows = done.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        user_id: userId,
        session_id: sessionId,
        exercise_name: exercise.name,
        scheme: exercise.scheme,
        set_number: set.set_number,
        target: set.target,
        weight_kg: set.weight_kg,
        reps: set.reps,
        position: position++,
      })),
    );

    const sets = await supabase.from("workout_sets").insert(rows);
    if (sets.error) {
      // Do not leave a session with nothing in it behind.
      await supabase.from("workout_sessions").delete().eq("id", sessionId).eq("user_id", userId);
      throw sets.error;
    }

    revalidateWorkouts();
    return { ok: true, data: { id: sessionId } };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSession(id: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateWorkouts();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* The plan                                                                   */
/* -------------------------------------------------------------------------- */

const DayInput = z.object({
  dayId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  focus: z.string().trim().max(200).nullable().optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        scheme: SchemeSchema,
        sets: z.number().int().min(1).max(10),
      }),
    )
    .max(30),
});

export type DayInput = z.input<typeof DayInput>;

/**
 * Replaces one day's name, focus and exercise list with what was submitted.
 * Past sessions keep their own copy of what was done, so this never changes
 * history.
 */
export async function saveDay(raw: DayInput): Promise<ActionResult> {
  try {
    const input = DayInput.parse(raw);
    const { supabase, userId } = await session();

    const updated = await supabase
      .from("workout_days")
      .update({ name: input.name, focus: input.focus || null })
      .eq("id", input.dayId)
      .eq("user_id", userId);
    if (updated.error) throw updated.error;

    const removed = await supabase
      .from("workout_exercises")
      .delete()
      .eq("day_id", input.dayId)
      .eq("user_id", userId);
    if (removed.error) throw removed.error;

    if (input.exercises.length > 0) {
      const inserted = await supabase.from("workout_exercises").insert(
        input.exercises.map((exercise, position) => ({
          user_id: userId,
          day_id: input.dayId,
          name: exercise.name,
          scheme: exercise.scheme,
          sets: exercise.sets,
          position,
        })),
      );
      if (inserted.error) throw inserted.error;
    }

    revalidateWorkouts();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Adds a day to the end of the rotation: D after C, and so on. */
export async function addDay(): Promise<ActionResult> {
  try {
    const { supabase, userId } = await session();
    const existing = await supabase
      .from("workout_days")
      .select("code, position")
      .eq("user_id", userId);
    if (existing.error) throw existing.error;

    const rows = (existing.data ?? []) as { code: string; position: number }[];
    const taken = new Set(rows.map((row) => row.code));
    const code = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((letter) => !taken.has(letter));
    if (!code) return { ok: false, error: "That is already a lot of days." };

    const { error } = await supabase.from("workout_days").insert({
      user_id: userId,
      code,
      name: `Workout ${code}`,
      position: Math.max(-1, ...rows.map((row) => row.position)) + 1,
    });
    if (error) throw error;

    revalidateWorkouts();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Removes a day from the plan. Sessions already logged against it stay. */
export async function deleteDay(id: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    const { supabase, userId } = await session();
    const count = await supabase
      .from("workout_days")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count.count ?? 0) <= 1) {
      return { ok: false, error: "The plan needs at least one day." };
    }
    const { error } = await supabase
      .from("workout_days")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateWorkouts();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
