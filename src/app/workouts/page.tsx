import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkoutLoggerClient } from "@/components/workouts/WorkoutLoggerClient";
import { WorkoutsSetupNeeded } from "@/components/workouts/WorkoutsSetupNeeded";
import { todayInSouthAfrica } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";
import {
  ensurePlan,
  lastTimes,
  listSessions,
  WorkoutsNotSetUpError,
} from "@/lib/workout-data";
import { nextDayCode, PROGRESSION_RULE, SCHEME_RULES } from "@/lib/workouts";

export const metadata = { title: "Train - Workouts" };

export default async function TrainPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; saved?: string }>;
}) {
  const { day: picked, saved } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let days, sessions;
  try {
    [days, sessions] = await Promise.all([
      ensurePlan(supabase, user.id),
      listSessions(supabase, user.id, 60),
    ]);
  } catch (error) {
    if (error instanceof WorkoutsNotSetUpError) return <WorkoutsSetupNeeded />;
    throw error;
  }

  const nextCode = nextDayCode(
    days.map((d) => d.code),
    sessions[0]?.day_code ?? null,
  );
  const day =
    days.find((d) => d.code === picked) ?? days.find((d) => d.code === nextCode) ?? days[0];
  const savedSession = saved ? sessions.find((s) => s.id === saved) : undefined;

  return (
    <div className="space-y-5">
      {savedSession && (
        <p
          role="status"
          className="card p-3 text-sm"
          style={{ borderColor: "var(--good-ink)", color: "var(--good-ink)" }}
        >
          {savedSession.day_name} saved — {savedSession.sets.length} sets logged. Next up is{" "}
          {days.find((d) => d.code === nextCode)?.name ?? "the next day"}.
        </p>
      )}

      <nav aria-label="Workout day" className="flex flex-wrap gap-2">
        {days.map((d) => (
          <Link
            key={d.id}
            href={`/workouts?day=${d.code}`}
            aria-current={d.id === day?.id ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${
              d.id === day?.id
                ? "border-transparent bg-accent text-accent-ink"
                : "border-line text-ink-secondary hover:text-ink"
            }`}
          >
            {d.name}
            {d.code === nextCode && d.id !== day?.id && (
              <span className="ml-1.5 text-xs text-accent">next</span>
            )}
          </Link>
        ))}
      </nav>

      {day ? (
        <>
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {day.name}
              {day.code === nextCode && (
                <span className="ml-2 align-middle text-xs font-medium text-ink-muted">
                  next in the rotation
                </span>
              )}
            </h1>
            {day.focus && <p className="text-sm text-ink-secondary">{day.focus}</p>}
            <p className="text-xs text-ink-muted">
              {SCHEME_RULES} {PROGRESSION_RULE}
            </p>
          </header>

          {day.exercises.length === 0 ? (
            <p className="card p-4 text-sm text-ink-secondary">
              {day.name} has no exercises yet.{" "}
              <Link href="/workouts/plan" className="text-accent underline underline-offset-4">
                Add some on the Plan page
              </Link>
              .
            </p>
          ) : (
            <WorkoutLoggerClient
              key={day.id}
              day={day}
              history={lastTimes(sessions)}
              today={todayInSouthAfrica()}
            />
          )}
        </>
      ) : (
        <p className="text-sm text-ink-secondary">No workout days in the plan yet.</p>
      )}
    </div>
  );
}
