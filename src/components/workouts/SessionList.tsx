"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteSession } from "@/app/workouts/actions";
import type { WorkoutSessionRow, WorkoutSetRow } from "@/lib/workout-data";
import { formatSet } from "@/lib/workouts";

/** Logged workouts, each opening to show every set, grouped by exercise. */
export function SessionList({ sessions }: { sessions: WorkoutSessionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(session: WorkoutSessionRow) {
    if (!window.confirm(`Delete ${session.day_name} from ${session.date}? This cannot be undone.`)) {
      return;
    }
    setBusy(session.id);
    setError(null);
    const result = await deleteSession(session.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (sessions.length === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {sessions.map((session) => {
          const groups = byExercise(session.sets);
          return (
            <li key={session.id} className="card">
              <details>
                <summary className="flex cursor-pointer list-none items-baseline gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{session.day_name}</span>
                    <span className="text-xs text-ink-muted">
                      {session.date} · {groups.length} exercise{groups.length === 1 ? "" : "s"} ·{" "}
                      {session.sets.length} sets
                    </span>
                  </span>
                  <span className="text-xs text-ink-muted tabular">
                    {volume(session.sets) > 0 && `${groupThousands(volume(session.sets))} kg`}
                  </span>
                </summary>
                <div className="space-y-3 border-t border-line p-4 pt-3">
                  <dl className="space-y-2 text-sm">
                    {groups.map(([name, sets]) => (
                      <div key={name}>
                        <dt className="font-medium">{name}</dt>
                        <dd className="tabular text-ink-secondary">
                          {sets.map(formatSet).join(" · ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {session.notes && (
                    <p className="text-sm text-ink-secondary">“{session.notes}”</p>
                  )}
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy === session.id}
                    onClick={() => void remove(session)}
                  >
                    {busy === session.id ? "Deleting..." : "Delete this workout"}
                  </button>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function byExercise(sets: WorkoutSetRow[]): [string, WorkoutSetRow[]][] {
  const groups = new Map<string, WorkoutSetRow[]>();
  for (const set of sets) {
    groups.set(set.exercise_name, [...(groups.get(set.exercise_name) ?? []), set]);
  }
  return [...groups.entries()];
}

/** Total kg moved: weight x reps over every weighted set. */
function volume(sets: WorkoutSetRow[]): number {
  return Math.round(sets.reduce((acc, set) => acc + (set.weight_kg ?? 0) * set.reps, 0));
}

/** "12 450", spaced by hand like amounts in lib/money, so server and browser agree. */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
