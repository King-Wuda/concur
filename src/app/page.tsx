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

  const [budget, workouts] = await Promise.all([
    budgetGlance(supabase, user.id),
    workoutGlance(supabase, user.id),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Today</h1>

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
              style={{ color: budget.remaining < 0 ? "var(--critical)" : "var(--good-ink)" }}
            >
              {formatRand(Math.abs(budget.remaining))}
            </p>
            <p className="text-sm text-ink-muted">
              {formatRand(budget.totalSpend)} spent across {budget.receiptCount} receipt
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
                <p className="text-3xl font-semibold">{workouts.next?.name ?? "No plan yet"}</p>
                {workouts.next?.focus && (
                  <p className="text-sm text-ink-muted">{workouts.next.focus}</p>
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {workouts.next && (
                  <Link href={`/workouts?day=${workouts.next.code}`} className="btn btn-primary">
                    Start {workouts.next.name}
                  </Link>
                )}
                <Link href="/workouts/history" className="btn">
                  History
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-secondary">{workouts.message}</p>
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
    return { ok: true, next: days.find((day) => day.code === code) ?? null, last };
  } catch (error) {
    if (error instanceof WorkoutsNotSetUpError) return { ok: false, message: error.message };
    throw error;
  }
}

function daysAgo(date: string): string {
  const today = todayInSouthAfrica();
  const diff = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000,
  );
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}
