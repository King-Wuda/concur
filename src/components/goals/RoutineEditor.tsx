"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createHabit, deleteHabit, updateHabit } from "@/app/goals/actions";
import {
  describeSchedule,
  WEEK_ORDER,
  WEEKDAY_NAMES,
  type Consistency,
} from "@/lib/routine";

type Habit = {
  id: string;
  name: string;
  weekdays: number[];
  goalId: string | null;
  goalTitle: string | null;
  consistency: Consistency;
  recent: { date: string; state: "done" | "missed" | "today" }[];
};

type GoalOption = { id: string; title: string };

/** The routine's habits: add one, change its days or goal, see how it is going. */
export function RoutineEditor({ habits, goals }: { habits: Habit[]; goals: GoalOption[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(habits.length === 0);

  return (
    <div className="space-y-4">
      {adding ? (
        <HabitForm
          goals={goals}
          onDone={habits.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Add to routine
        </button>
      )}

      {habits.length > 0 && (
        <ul className="space-y-2">
          {habits.map((habit) =>
            editing === habit.id ? (
              <li key={habit.id}>
                <HabitForm goals={goals} habit={habit} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={habit.id} className="card space-y-2 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold">{habit.name}</h2>
                    <p className="text-sm text-ink-secondary">
                      {describeSchedule(habit.weekdays)}
                      {habit.goalTitle && (
                        <span className="text-ink-muted"> · for {habit.goalTitle}</span>
                      )}
                    </p>
                  </div>
                  <button type="button" className="btn" onClick={() => setEditing(habit.id)}>
                    Edit
                  </button>
                </div>
                <ConsistencyLine consistency={habit.consistency} recent={habit.recent} />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ConsistencyLine({
  consistency,
  recent,
}: {
  consistency: Consistency;
  recent: Habit["recent"];
}) {
  const { due, done, streak } = consistency;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      <span className="flex items-center gap-1" aria-label="Recent scheduled days">
        {recent.map((day) => (
          <span
            key={day.date}
            title={`${day.date}: ${day.state}`}
            className="inline-block size-3 rounded-full border"
            style={
              day.state === "done"
                ? { background: "var(--good-ink)", borderColor: "var(--good-ink)" }
                : day.state === "today"
                  ? { borderColor: "var(--ink-muted)", borderStyle: "dashed" }
                  : { borderColor: "var(--border-strong)" }
            }
          />
        ))}
      </span>
      {due === 0 ? (
        <span className="text-ink-muted">No days due yet</span>
      ) : (
        <span className="tabular text-ink-secondary">
          {done} of {due} done ({Math.round((done / due) * 100)}%)
        </span>
      )}
      {streak > 0 && (
        <span className="tabular font-medium" style={{ color: "var(--good-ink)" }}>
          {streak} in a row
        </span>
      )}
    </div>
  );
}

function HabitForm({
  goals,
  habit,
  onDone,
}: {
  goals: GoalOption[];
  habit?: Habit;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(habit?.name ?? "");
  const [days, setDays] = useState<Set<number>>(() => new Set(habit?.weekdays ?? []));
  const [goalId, setGoalId] = useState<string>(habit?.goalId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefix = habit?.id ?? "new";

  const toggleDay = (day: number) =>
    setDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  async function save() {
    setError(null);
    setSaving(true);
    const input = { name, weekdays: [...days], goalId: goalId || null };
    const result = habit ? await updateHabit({ ...input, id: habit.id }) : await createHabit(input);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!habit) {
      setName("");
      setDays(new Set());
      setGoalId("");
    }
    onDone?.();
    router.refresh();
  }

  async function remove() {
    if (!habit) return;
    if (!window.confirm(`Delete "${habit.name}" and its history from your routine?`)) return;
    const result = await deleteHabit(habit.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.();
    router.refresh();
  }

  return (
    <section className="card space-y-3 p-4">
      {!habit && <h2 className="font-semibold">Add to your routine</h2>}

      <div className="space-y-1.5">
        <label htmlFor={`${prefix}-habit-name`} className="text-sm font-medium">
          What
        </label>
        <input
          id={`${prefix}-habit-name`}
          className="field"
          value={name}
          placeholder="Skincare, Bible study, laundry..."
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">On which days</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEK_ORDER.map((day) => {
            const on = days.has(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={WEEKDAY_NAMES[day]}
                onClick={() => toggleDay(day)}
                className={`h-10 min-w-11 rounded-lg border px-2 text-sm font-medium ${
                  on
                    ? "border-transparent bg-accent text-accent-ink"
                    : "border-line text-ink-secondary"
                }`}
              >
                {WEEKDAY_NAMES[day].slice(0, 3)}
              </button>
            );
          })}
          <button
            type="button"
            className="h-10 rounded-lg px-2 text-sm font-medium text-accent underline underline-offset-4"
            onClick={() => setDays(days.size === 7 ? new Set() : new Set([0, 1, 2, 3, 4, 5, 6]))}
          >
            {days.size === 7 ? "Clear" : "Every day"}
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          {days.size === 0 ? "Pick at least one day." : describeSchedule([...days])}
        </p>
      </fieldset>

      {goals.length > 0 && (
        <div className="space-y-1.5">
          <label htmlFor={`${prefix}-habit-goal`} className="text-sm font-medium">
            Works toward <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <select
            id={`${prefix}-habit-goal`}
            className="field"
            value={goalId}
            onChange={(event) => setGoalId(event.target.value)}
          >
            <option value="">No goal</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.title}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !name.trim() || days.size === 0}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : habit ? "Save" : "Add to routine"}
        </button>
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
        )}
        {habit && (
          <button type="button" className="btn btn-danger ml-auto" onClick={() => void remove()}>
            Delete
          </button>
        )}
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
