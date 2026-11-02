"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { isIsoDate } from "@/lib/month";
import { todayInSouthAfrica } from "@/lib/period";
import { addDays } from "@/lib/routine";
import { createClient } from "@/lib/supabase/server";

/**
 * Every write the Goals section makes. Each re-reads the session, and row
 * level security backs that up at the database.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

const DateSchema = z.string().refine(isIsoDate, "Expected a real date like 2026-11-04");
const Id = z.string().uuid();

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Sign in again.");
  return { supabase, userId: user.id };
}

function failure(error: unknown): { ok: false; error: string } {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "42P01" || code === "PGRST205") {
      return {
        ok: false,
        error:
          "Run supabase/migrations/0007_goals_routine_body.sql in the Supabase SQL editor first.",
      };
    }
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong.";
  return { ok: false, error: message };
}

function revalidateGoals() {
  revalidatePath("/");
  revalidatePath("/goals", "layout");
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

const GoalInput = z.object({
  title: z.string().trim().min(1, "Give the goal a name.").max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  deadline: DateSchema.nullable(),
  milestones: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
});

export type GoalInput = z.input<typeof GoalInput>;

/** Adds a goal at the bottom of the list - the lowest priority until moved up. */
export async function createGoal(raw: GoalInput): Promise<ActionResult<{ id: string }>> {
  try {
    const input = GoalInput.parse(raw);
    const { supabase, userId } = await session();

    const last = await supabase
      .from("goals")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw last.error;

    const inserted = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        title: input.title,
        notes: input.notes || null,
        deadline: input.deadline,
        position: (last.data?.position ?? -1) + 1,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;

    const milestones = input.milestones ?? [];
    if (milestones.length > 0) {
      const added = await supabase.from("goal_milestones").insert(
        milestones.map((title, position) => ({
          user_id: userId,
          goal_id: inserted.data.id,
          title,
          position,
        })),
      );
      if (added.error) throw added.error;
    }

    revalidateGoals();
    return { ok: true, data: { id: inserted.data.id as string } };
  } catch (error) {
    return failure(error);
  }
}

const GoalUpdate = z.object({
  id: Id,
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  deadline: DateSchema.nullable(),
});

export async function updateGoal(raw: z.input<typeof GoalUpdate>): Promise<ActionResult> {
  try {
    const input = GoalUpdate.parse(raw);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("goals")
      .update({ title: input.title, notes: input.notes || null, deadline: input.deadline })
      .eq("id", input.id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Marks a goal achieved (or back to in progress). */
export async function setGoalAchieved(id: string, achieved: boolean): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("goals")
      .update({ achieved_at: achieved ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase.from("goals").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Saves the priority order: the ids given, top first, become positions 0..n.
 * Sent whole rather than as "move up one" so two quick taps cannot race.
 */
export async function reorderGoals(ids: string[]): Promise<ActionResult> {
  try {
    z.array(Id).max(200).parse(ids);
    const { supabase, userId } = await session();
    for (const [position, id] of ids.entries()) {
      const { error } = await supabase
        .from("goals")
        .update({ position })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    }
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

export async function addMilestone(goalId: string, title: string): Promise<ActionResult> {
  try {
    Id.parse(goalId);
    const name = z.string().trim().min(1, "Name the milestone.").max(200).parse(title);
    const { supabase, userId } = await session();

    const last = await supabase
      .from("goal_milestones")
      .select("position")
      .eq("goal_id", goalId)
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw last.error;

    const { error } = await supabase.from("goal_milestones").insert({
      user_id: userId,
      goal_id: goalId,
      title: name,
      position: (last.data?.position ?? -1) + 1,
    });
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function setMilestoneDone(id: string, done: boolean): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("goal_milestones")
      .update({ done_at: done ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("goal_milestones")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* The routine                                                                */
/* -------------------------------------------------------------------------- */

const HabitInput = z.object({
  name: z.string().trim().min(1, "Name the habit.").max(120),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day.")
    .max(7)
    .transform((days) => [...new Set(days)].sort()),
  goalId: Id.nullable(),
});

export type HabitInput = z.input<typeof HabitInput>;

export async function createHabit(raw: HabitInput): Promise<ActionResult> {
  try {
    const input = HabitInput.parse(raw);
    const { supabase, userId } = await session();

    const last = await supabase
      .from("habits")
      .select("position")
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw last.error;

    const { error } = await supabase.from("habits").insert({
      user_id: userId,
      name: input.name,
      weekdays: input.weekdays,
      goal_id: input.goalId,
      position: (last.data?.position ?? -1) + 1,
    });
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateHabit(
  raw: HabitInput & { id: string },
): Promise<ActionResult> {
  try {
    const id = Id.parse(raw.id);
    const input = HabitInput.parse(raw);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("habits")
      .update({ name: input.name, weekdays: input.weekdays, goal_id: input.goalId })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase.from("habits").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Ticks a habit off for a day, or unticks it. Only today and the week before:
 * enough to catch up on a forgotten tick, not to rewrite last month.
 */
export async function setHabitDone(
  habitId: string,
  date: string,
  done: boolean,
): Promise<ActionResult> {
  try {
    Id.parse(habitId);
    DateSchema.parse(date);
    const today = todayInSouthAfrica();
    if (date > today || date < addDays(today, -7)) {
      return { ok: false, error: "Ticks can be changed for today and the past week only." };
    }
    const { supabase, userId } = await session();

    if (done) {
      const { error } = await supabase
        .from("habit_checks")
        .upsert(
          { user_id: userId, habit_id: habitId, date },
          { onConflict: "habit_id,date", ignoreDuplicates: true },
        );
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("habit_checks")
        .delete()
        .eq("habit_id", habitId)
        .eq("date", date)
        .eq("user_id", userId);
      if (error) throw error;
    }
    revalidateGoals();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
