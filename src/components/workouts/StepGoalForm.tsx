"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveStepGoal } from "@/app/workouts/actions";
import { formatSteps } from "@/lib/body";

/** The daily step target. Once set, each day's logged steps tick it off on Today. */
export function StepGoalForm({ goal }: { goal: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(goal === null);
  const [value, setValue] = useState(goal === null ? "10000" : String(goal));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!editing && goal !== null) {
    return (
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-semibold tabular">{formatSteps(goal)} a day</p>
        <button
          type="button"
          className="text-sm font-medium text-accent underline underline-offset-4"
          onClick={() => setEditing(true)}
        >
          Change
        </button>
      </div>
    );
  }

  async function save(next: number | null) {
    setError(null);
    setSaving(true);
    const result = await saveStepGoal(next);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const number = Number(value.replace(/\s/g, ""));
        if (!Number.isInteger(number) || number < 1) {
          setError("Enter a whole number of steps.");
          return;
        }
        void save(number);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label htmlFor="step-goal" className="sr-only">
          Steps a day
        </label>
        <input
          id="step-goal"
          className="field max-w-[10rem] tabular"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Set goal"}
        </button>
        {goal !== null && (
          <>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" className="btn" onClick={() => void save(null)}>
              Remove goal
            </button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : (
        <p className="text-xs text-ink-muted">
          Shows on your Today list and ticks itself once the day&apos;s steps reach it.
        </p>
      )}
    </form>
  );
}
