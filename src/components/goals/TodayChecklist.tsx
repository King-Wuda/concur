"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { setHabitDone } from "@/app/goals/actions";
import { formatSteps } from "@/lib/body";

type Item = {
  id: string;
  name: string;
  schedule: string;
  done: boolean;
  /** "05:00–07:00", or null when the habit has no set time. */
  time: string | null;
  category: string | null;
  notes: string | null;
};

type Steps = { goal: number; logged: number | null };

/**
 * One day's routine as a checklist, in time order. A tap ticks straight away
 * and saves in the background; if the save fails the tick is put back and the
 * reason shown. The step goal sits at the end and ticks itself once the day's
 * logged steps reach it.
 */
export function TodayChecklist({
  date,
  habits,
  steps,
}: {
  date: string;
  habits: Item[];
  steps: Steps | null;
}) {
  const router = useRouter();
  const [done, setDone] = useState(
    () => new Set(habits.filter((h) => h.done).map((h) => h.id)),
  );
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string) {
    const next = !done.has(id);
    setError(null);
    setDone((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    const result = await setHabitDone(id, date, next);
    if (!result.ok) {
      setError(result.error);
      setDone((current) => {
        const copy = new Set(current);
        if (next) copy.delete(id);
        else copy.add(id);
        return copy;
      });
      return;
    }
    router.refresh();
  }

  const stepsDone =
    steps !== null && steps.logged !== null && steps.logged >= steps.goal;

  if (habits.length === 0 && !steps) {
    return (
      <p className="card p-4 text-sm text-ink-secondary">
        Nothing from your routine is scheduled for this day.
      </p>
    );
  }

  const total = habits.length + (steps ? 1 : 0);
  const count =
    habits.filter((h) => done.has(h.id)).length + (stepsDone ? 1 : 0);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          {count === total ? "All done" : `${count} of ${total} done`}
        </h2>
        <div
          className="h-2 w-32 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Done today"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${(count / total) * 100}%`,
              background: "var(--good-ink)",
            }}
          />
        </div>
      </div>

      <ul className="card divide-y divide-[var(--border)]">
        {habits.map((habit) => {
          const checked = done.has(habit.id);
          return (
            <li key={habit.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  className="size-6 shrink-0 accent-[var(--good-ink)]"
                  checked={checked}
                  onChange={() => void toggle(habit.id)}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-medium ${checked ? "text-ink-muted line-through" : ""}`}
                  >
                    {habit.name}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {[habit.category, habit.schedule]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {habit.notes && (
                    <span className="block text-xs text-ink-muted italic">
                      {habit.notes}
                    </span>
                  )}
                </span>
                {habit.time && (
                  <span className="shrink-0 self-start pt-0.5 text-sm text-ink-secondary tabular">
                    {habit.time}
                  </span>
                )}
              </label>
            </li>
          );
        })}

        {steps && (
          <li>
            <Link
              href="/workouts/body"
              className="flex min-h-14 items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded border-2 text-sm"
                style={
                  stepsDone
                    ? {
                        background: "var(--good-ink)",
                        borderColor: "var(--good-ink)",
                        color: "var(--page)",
                      }
                    : { borderColor: "var(--border-strong)" }
                }
              >
                {stepsDone ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-medium ${stepsDone ? "text-ink-muted line-through" : ""}`}
                >
                  {formatSteps(steps.goal)} steps
                </span>
                <span className="block text-xs text-ink-muted">
                  Fitness ·{" "}
                  {steps.logged === null
                    ? "ticks itself when you log your steps"
                    : `${formatSteps(steps.logged)} logged`}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium text-accent">
                Log
              </span>
            </Link>
          </li>
        )}
      </ul>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
