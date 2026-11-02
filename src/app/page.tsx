import Link from "next/link";
import { redirect } from "next/navigation";

import { analyseMonth } from "@/lib/aggregate";
import { getMonthSnapshot, resolveMonth } from "@/lib/data";
import { formatRand } from "@/lib/money";
import { formatMonthLong } from "@/lib/month";
import { formatPeriod, todayInSouthAfrica } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import {
  ensurePlan,
  listSessions,
  WorkoutsNotSetUpError,
  type WorkoutDayRow,
  type WorkoutSessionRow,
} from "@/lib/workout-data";
import { nextDayCode } from "@/lib/workouts";
import { formatSteps } from "@/lib/body";
import {
  GoalsNotSetUpError,
  listBodyLogs,
  listChecks,
  listGoals,
  listHabits,
  listQuotes,
} from "@/lib/goals-data";
import { DailyQuote } from "@/components/goals/DailyQuote";
import { quoteForDay } from "@/lib/quotes";
import {
  deadlineStatus,
  describeDeadline,
  isDue,
  milestoneProgress,
} from "@/lib/routine";

export const metadata = { title: "Concur" };

/**
 * The hub: one card per part of life being tracked, each showing the one thing
 * worth knowing at a glance and the way in. New sections slot in as cards.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayInSouthAfrica();
  const [budget, workouts, goals, body] = await Promise.all([
    budgetGlance(supabase, user.id),
    workoutGlance(supabase, user.id),
    goalsGlance(supabase, user.id, today),
    bodyGlance(supabase, user.id, today),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>

      {goals.ok && (
        <DailyQuote quotes={goals.quotes} todays={goals.todaysQuote} />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <section className="card flex flex-col gap-4 p-4 sm:p-5">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Budget</h2>
            <span className="text-sm text-ink-muted tabular">
              {formatMonthLong(budget.monthKey)}
              {budget.period && ` · ${formatPeriod(budget.period)}`}
            </span>
          </header>

          <div>
            <p className="text-sm text-ink-secondary">
              {budget.remaining < 0 ? "Overspent" : "Left to save"}
            </p>
            <p
              className="text-3xl font-semibold tabular"
              style={{
                color:
                  budget.remaining < 0 ? "var(--critical)" : "var(--good-ink)",
              }}
            >
              {formatRand(Math.abs(budget.remaining))}
            </p>
            <p className="text-sm text-ink-muted">
              {formatRand(budget.totalSpend)} spent across {budget.receiptCount}{" "}
              receipt
              {budget.receiptCount === 1 ? "" : "s"}
            </p>
          </div>

          <div className="mt-auto flex flex-wrap gap-2">
            <Link href="/budget/add" className="btn btn-primary">
              Add a receipt
            </Link>
            <Link href="/budget" className="btn">
              Open Budget
            </Link>
          </div>
        </section>

        <section className="card flex flex-col gap-4 p-4 sm:p-5">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Workouts</h2>
            {workouts.ok && workouts.last && (
              <span className="text-sm text-ink-muted">
                Last: {workouts.last.day_name}, {daysAgo(workouts.last.date)}
              </span>
            )}
          </header>

          {workouts.ok ? (
            <>
              <div>
                <p className="text-sm text-ink-secondary">Next up</p>
                <p className="text-3xl font-semibold">
                  {workouts.next?.name ?? "No plan yet"}
                </p>
                {workouts.next?.focus && (
                  <p className="text-sm text-ink-muted">
                    {workouts.next.focus}
                  </p>
                )}
              </div>
              {body && (
                <p className="text-sm text-ink-secondary">
                  Today:{" "}
                  {body.weight_kg === null
                    ? "no weigh-in yet"
                    : `${body.weight_kg} kg`}{" "}
                  ·{" "}
                  {body.steps === null
                    ? "steps not logged"
                    : `${formatSteps(body.steps)} steps`}
                </p>
              )}
              <div className="mt-auto flex flex-wrap gap-2">
                {workouts.next && (
                  <Link
                    href={`/workouts?day=${workouts.next.code}`}
                    className="btn btn-primary"
                  >
                    Start {workouts.next.name}
                  </Link>
                )}
                <Link href="/workouts/body" className="btn">
                  Log weight &amp; steps
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">{workouts.message}</p>
          )}
        </section>

        <section className="card flex flex-col gap-4 p-4 sm:p-5">
          <header className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Goals</h2>
            {goals.ok && goals.dueCount > 0 && (
              <span className="text-sm text-ink-muted tabular">
                {goals.doneCount} of {goals.dueCount} done today
              </span>
            )}
          </header>

          {goals.ok ? (
            <>
              {goals.due.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {goals.due.map((habit) => (
                    <li key={habit.name} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-flex size-4 items-center justify-center rounded border text-[0.6rem]"
                        style={
                          habit.done
                            ? {
                                background: "var(--good-ink)",
                                borderColor: "var(--good-ink)",
                                color: "var(--page)",
                              }
                            : { borderColor: "var(--border-strong)" }
                        }
                      >
                        {habit.done ? "✓" : ""}
                      </span>
                      <span
                        className={
                          habit.done ? "text-ink-muted line-through" : ""
                        }
                      >
                        {habit.name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-ink-secondary">
                  {goals.hasHabits
                    ? "Nothing from your routine today."
                    : "No routine set up yet."}
                </p>
              )}

              {goals.top && (
                <div className="border-t border-line pt-3">
                  <p className="text-xs text-ink-muted">Top goal</p>
                  <p className="font-medium">{goals.top.title}</p>
                  <p className="text-sm text-ink-secondary">
                    {goals.top.deadline}
                    {goals.top.progress &&
                      ` · ${goals.top.progress} milestones`}
                  </p>
                </div>
              )}

              <div className="mt-auto flex flex-wrap gap-2">
                <Link href="/goals" className="btn btn-primary">
                  {goals.dueCount > 0 && goals.doneCount < goals.dueCount
                    ? "Tick off today"
                    : "Open today"}
                </Link>
                <Link href="/goals/list" className="btn">
                  All goals
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">{goals.message}</p>
          )}
        </section>
      </div>
    </div>
  );
}

type DB = Awaited<ReturnType<typeof createClient>>;

async function budgetGlance(supabase: DB, userId: string) {
  const { monthKey } = await resolveMonth(supabase, userId, null);
  const snapshot = await getMonthSnapshot(supabase, userId, monthKey);
  const { totals } = analyseMonth(snapshot);
  return {
    monthKey,
    period: snapshot.period,
    remaining: totals.remaining,
    totalSpend: totals.totalSpend,
    receiptCount: totals.receiptCount,
  };
}

async function workoutGlance(
  supabase: DB,
  userId: string,
): Promise<
  | { ok: true; next: WorkoutDayRow | null; last: WorkoutSessionRow | null }
  | { ok: false; message: string }
> {
  try {
    const [days, sessions] = await Promise.all([
      ensurePlan(supabase, userId),
      listSessions(supabase, userId, 1),
    ]);
    const last = sessions[0] ?? null;
    const code = nextDayCode(
      days.map((day) => day.code),
      last?.day_code ?? null,
    );
    return {
      ok: true,
      next: days.find((day) => day.code === code) ?? null,
      last,
    };
  } catch (error) {
    if (error instanceof WorkoutsNotSetUpError)
      return { ok: false, message: error.message };
    throw error;
  }
}

async function goalsGlance(supabase: DB, userId: string, today: string) {
  try {
    const [habits, checks, goals, quotes] = await Promise.all([
      listHabits(supabase, userId),
      listChecks(supabase, userId, today),
      listGoals(supabase, userId),
      listQuotes(supabase, userId),
    ]);
    const due = habits
      .filter((habit) => isDue(habit, today))
      .map((habit) => ({
        name: habit.name,
        done: checks.get(habit.id)?.has(today) ?? false,
      }));
    const first = goals.find((goal) => !goal.achieved_at);
    const progress = first ? milestoneProgress(first.milestones) : null;
    return {
      ok: true as const,
      quotes,
      todaysQuote: quoteForDay(quotes, today),
      hasHabits: habits.length > 0,
      due,
      dueCount: due.length,
      doneCount: due.filter((habit) => habit.done).length,
      top: first
        ? {
            title: first.title,
            deadline: describeDeadline(deadlineStatus(first.deadline, today)),
            progress:
              progress && progress.total > 0
                ? `${progress.done}/${progress.total}`
                : null,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof GoalsNotSetUpError)
      return { ok: false as const, message: error.message };
    throw error;
  }
}

async function bodyGlance(supabase: DB, userId: string, today: string) {
  try {
    const logs = await listBodyLogs(supabase, userId, today);
    return logs[0] ?? { date: today, weight_kg: null, steps: null };
  } catch (error) {
    // Before migration 0007 there is simply nothing to show.
    if (error instanceof GoalsNotSetUpError) return null;
    throw error;
  }
}

function daysAgo(date: string): string {
  const today = todayInSouthAfrica();
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86_400_000,
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}
