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

function check(error: { code?: string } | null) {
  if (isMissingTable(error)) throw new GoalsNotSetUpError();
  if (error) throw error;
}

/** Every goal, in priority order, achieved ones included, each with its milestones. */
export async function listGoals(supabase: DB, userId: string): Promise<GoalRow[]> {
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, title, notes, deadline, position, achieved_at, created_at," +
        " goal_milestones (id, goal_id, title, done_at, position)",
    )
    .eq("user_id", userId)
    .order("position")
    .order("created_at");
  check(error);

  type Raw = Omit<GoalRow, "milestones"> & { goal_milestones: MilestoneRow[] };
  return ((data ?? []) as unknown as Raw[]).map(({ goal_milestones, ...goal }) => ({
    ...goal,
    milestones: [...(goal_milestones ?? [])].sort((a, b) => a.position - b.position),
  }));
}

export async function listHabits(supabase: DB, userId: string): Promise<HabitRow[]> {
  const { data, error } = await supabase
    .from("habits")
    .select("id, name, weekdays, goal_id, position, created_at")
    .eq("user_id", userId)
    .order("position")
    .order("created_at");
  check(error);
  return ((data ?? []) as HabitRow[]).map((habit) => ({
    ...habit,
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
