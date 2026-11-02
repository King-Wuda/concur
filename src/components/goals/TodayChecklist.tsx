"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { setHabitDone } from "@/app/goals/actions";

type Item = { id: string; name: string; schedule: string; done: boolean };

/**
 * One day's routine as a checklist. A tap ticks straight away and saves in
 * the background; if the save fails the tick is put back and the reason shown.
 */
export function TodayChecklist({ date, habits }: { date: string; habits: Item[] }) {
  const router = useRouter();
  const [done, setDone] = useState(() => new Set(habits.filter((h) => h.done).map((h) => h.id)));
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

  if (habits.length === 0) {
    return (
      <p className="card p-4 text-sm text-ink-secondary">
        Nothing from your routine is scheduled for this day.
      </p>
    );
  }

  const count = habits.filter((h) => done.has(h.id)).length;
  const all = count === habits.length;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{all ? "All done" : `${count} of ${habits.length} done`}</h2>
        <div
          className="h-2 w-32 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={count}
          aria-valuemin={0}
          aria-valuemax={habits.length}
          aria-label="Done today"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${(count / habits.length) * 100}%`,
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
                  <span className="text-xs text-ink-muted">{habit.schedule}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
