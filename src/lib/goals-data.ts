import type { SupabaseClient } from "@supabase/supabase-js";

import type { BodyLog } from "@/lib/body";
import type { Quote } from "@/lib/quotes";

/**
 * Database access for goals, the routine and the body log. As elsewhere, every
 * query runs through the caller's request-scoped client under row level
 * security.
 */

type DB = SupabaseClient;

export type MilestoneRow = {
  id: string;
  goal_id: string;
  title: string;
  done_at: string | null;
  position: number;
};

export type GoalRow = {
  id: string;
  title: string;
  notes: string | null;
  deadline: string | null;
  /** When a focus block starts; null for most goals. */
  start_date: string | null;
  category: string | null;
  position: number;
  achieved_at: string | null;
  created_at: string;
  milestones: MilestoneRow[];
};

export type HabitRow = {
  id: string;
  name: string;
  weekdays: number[];
  goal_id: string | null;
  position: number;
  created_at: string;
  /** "05:00:00", or null for a habit with no set time. */
  start_time: string | null;
  end_time: string | null;
  category: string | null;
  notes: string | null;
};

/** Thrown until migration 0007 has been run, so a page can say so plainly. */
export class GoalsNotSetUpError extends Error {
  constructor() {
    super(
      "Run supabase/migrations/0007_goals_routine_body.sql in the Supabase SQL editor to set this up.",
    );
  }
}

function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

/**
 * Before migration 0008 the time, category and start-date columns do not
 * exist; a select naming them fails with "undefined column". Pages then fall
 * back to the columns that do, and those fields read as empty.
 */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

function check(error: { code?: string } | null) {
  if (isMissingTable(error)) throw new GoalsNotSetUpError();
  if (error) throw error;
}

/** Every goal, in priority order, achieved ones included, each with its milestones. */
export async function listGoals(supabase: DB, userId: string): Promise<GoalRow[]> {
  const query = (extra: string) =>
    supabase
      .from("goals")
      .select(
        `id, title, notes, deadline, position, achieved_at, created_at${extra},` +
          " goal_milestones (id, goal_id, title, done_at, position)",
      )
      .eq("user_id", userId)
      .order("position")
      .order("created_at");

  let { data, error } = await query(", category, start_date");
  if (isMissingColumn(error)) ({ data, error } = await query(""));
  check(error);

  type Raw = Omit<GoalRow, "milestones"> & { goal_milestones: MilestoneRow[] };
  return ((data ?? []) as unknown as Raw[]).map(({ goal_milestones, ...goal }) => ({
    ...goal,
    start_date: goal.start_date ?? null,
    category: goal.category ?? null,
    milestones: [...(goal_milestones ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function listHabits(supabase: DB, userId: string): Promise<HabitRow[]> {
  const query = (extra: string) =>
    supabase
      .from("habits")
      .select(`id, name, weekdays, goal_id, position, created_at${extra}`)
      .eq("user_id", userId)
      .order("position")
      .order("created_at");

  let { data, error } = await query(", start_time, end_time, category, notes");
  if (isMissingColumn(error)) ({ data, error } = await query(""));
  check(error);
  return ((data ?? []) as unknown as HabitRow[]).map((habit) => ({
    ...habit,
    start_time: habit.start_time ?? null,
    end_time: habit.end_time ?? null,
    category: habit.category ?? null,
    notes: habit.notes ?? null,
    weekdays: habit.weekdays.map(Number),
    // The day it was added, in South African terms, is when its record starts.
    created_at: localDate(habit.created_at),
  }));
}

/** Ticks since `since` (inclusive), as habit id -> set of dates. */
export async function listChecks(
  supabase: DB,
  userId: string,
  since: string,
): Promise<Map<string, Set<string>>> {
  const { data, error } = await supabase
    .from("habit_checks")
    .select("habit_id, date")
    .eq("user_id", userId)
    .gte("date", since);
  check(error);

  const byHabit = new Map<string, Set<string>>();
  for (const row of (data ?? []) as { habit_id: string; date: string }[]) {
    byHabit.set(row.habit_id, (byHabit.get(row.habit_id) ?? new Set()).add(row.date));
  }
  return byHabit;
}

/** Body log entries since `since`, oldest first. */
export async function listBodyLogs(
  supabase: DB,
  userId: string,
  since: string,
): Promise<BodyLog[]> {
  const { data, error } = await supabase
    .from("body_logs")
    .select("date, weight_kg, steps")
    .eq("user_id", userId)
    .gte("date", since)
    .order("date");
  check(error);
  return ((data ?? []) as BodyLog[]).map((row) => ({
    date: row.date,
    weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
    steps: row.steps === null ? null : Number(row.steps),
  }));
}

/** Your quotes and affirmations, oldest first - the order the daily pick uses. */
export async function listQuotes(supabase: DB, userId: string): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, kind, text, author")
    .eq("user_id", userId)
    .order("created_at")
    .order("id");
  check(error);
  return (data ?? []) as Quote[];
}

/** A timestamp's date in Johannesburg (UTC+2, no daylight saving). */
function localDate(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The daily step goal, or null if none is set (or before migration 0008). */
export async function getStepGoal(supabase: DB, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("step_goal")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingTable(error)) return null;
  if (error) throw error;
  return data?.step_goal ?? null;
}
