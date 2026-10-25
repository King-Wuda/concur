"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { saveSession } from "@/app/workouts/actions";
import { isIsoDate } from "@/lib/month";
import type { LastTime, WorkoutDayRow } from "@/lib/workout-data";
import {
  exerciseKey,
  formatKg,
  formatSet,
  progressFor,
  targetFor,
  type Progress,
} from "@/lib/workouts";

/**
 * Logging one workout, set by set, the way the spreadsheet did it: weight and
 * reps against each set's target, with last time's numbers alongside.
 *
 * Weights start filled in from last time, because most sets repeat the weight
 * until the reps reach the top of the range; reps start empty, because those
 * are what this session is about. A set left without reps is simply not
 * logged, so skipping one is fine.
 *
 * The draft is kept on this device as it is typed, so a phone locking or the
 * page reloading between sets does not lose the workout.
 */

type Entry = { weight: string; reps: string };
type Draft = { date: string; notes: string; entries: Record<string, Entry[]> };

export function WorkoutLogger({
  day,
  history,
  today,
}: {
  day: WorkoutDayRow;
  /** Last time each exercise was done, keyed by exerciseKey(name). */
  history: Record<string, LastTime>;
  today: string;
}) {
  const router = useRouter();
  const draftKey = `workout-draft:${day.id}`;

  const fresh = (): Draft => ({
    date: today,
    notes: "",
    entries: Object.fromEntries(
      day.exercises.map((exercise) => {
        const last = history[exerciseKey(exercise.name)];
        return [
          exercise.id,
          Array.from({ length: exercise.sets }, (_, index) => {
            const weight = last?.sets.find((set) => set.set_number === index + 1)?.weight_kg;
            return { weight: weight === null || weight === undefined ? "" : formatKg(weight), reps: "" };
          }),
        ];
      }),
    ),
  });

  // Rendered only in the browser (see WorkoutLoggerClient), so an unfinished
  // workout saved on this device can be picked straight back up.
  const [draft, setDraft] = useState<Draft>(() => restore(draftKey, fresh()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (hasAnyReps(draft)) localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // As above.
    }
  }, [draft, draftKey]);

  const setEntry = (exerciseId: string, index: number, patch: Partial<Entry>) =>
    setDraft((current) => ({
      ...current,
      entries: {
        ...current.entries,
        [exerciseId]: current.entries[exerciseId].map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      },
    }));

  const loggedSets = Object.values(draft.entries)
    .flat()
    .filter((row) => row.reps.trim() !== "").length;

  async function save() {
    setError(null);
    if (!isIsoDate(draft.date)) {
      setError("Pick the date you trained.");
      return;
    }

    const exercises = day.exercises.map((exercise) => ({
      name: exercise.name,
      scheme: exercise.scheme,
      sets: (draft.entries[exercise.id] ?? []).flatMap((row, index) => {
        const reps = parseWhole(row.reps);
        if (reps === null) return [];
        return [
          {
            set_number: index + 1,
            target: targetFor(exercise.scheme, index + 1).label,
            weight_kg: parseWeight(row.weight),
            reps,
          },
        ];
      }),
    }));

    setSaving(true);
    const result = await saveSession({
      dayId: day.id,
      date: draft.date,
      notes: draft.notes.trim() || null,
      exercises,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Nothing to clear.
    }
    router.push(`/workouts?saved=${result.data.id}`);
    router.refresh();
  }

  function discard() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Nothing to clear.
    }
    setDraft(fresh());
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="workout-date" className="text-sm font-medium">
            Date
          </label>
          <input
            id="workout-date"
            type="date"
            className="field"
            value={draft.date}
            max={today}
            onChange={(event) => setDraft((d) => ({ ...d, date: event.target.value }))}
          />
        </div>
        {hasAnyReps(draft) && (
          <button type="button" className="btn ml-auto" onClick={discard}>
            Start over
          </button>
        )}
      </div>

      <ol className="space-y-3">
        {day.exercises.map((exercise) => {
          const last = history[exerciseKey(exercise.name)];
          const progress = progressFor(exercise.scheme, exercise.sets, last?.sets ?? []);
          const rows = draft.entries[exercise.id] ?? [];
          return (
            <li key={exercise.id} className="card space-y-3 p-4">
              <header className="space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="font-semibold">{exercise.name}</h2>
                  <span className="text-xs text-ink-muted">
                    {exercise.sets} sets {exercise.scheme}
                  </span>
                </div>
                {last ? (
                  <p className="text-xs text-ink-secondary">
                    Last time ({shortDate(last.date)}):{" "}
                    <span className="tabular">{last.sets.map(formatSet).join(" · ")}</span>
                  </p>
                ) : (
                  <p className="text-xs text-ink-muted">First time logging this one.</p>
                )}
                <ProgressNote progress={progress} />
              </header>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-muted">
                    <th className="w-12 pb-1 font-medium">Set</th>
                    <th className="w-16 pb-1 font-medium">Target</th>
                    <th className="pb-1 font-medium">kg</th>
                    <th className="pb-1 font-medium">Reps</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const target = targetFor(exercise.scheme, index + 1);
                    const reps = parseWhole(row.reps);
                    const hitTop = reps !== null && reps >= target.max;
                    const id = `${exercise.id}-${index}`;
                    return (
                      <tr key={index}>
                        <td className="py-1 tabular text-ink-secondary">{index + 1}</td>
                        <td className="py-1 tabular text-ink-secondary">{target.label}</td>
                        <td className="py-1 pr-2">
                          <label className="sr-only" htmlFor={`${id}-kg`}>
                            {exercise.name} set {index + 1} weight in kg
                          </label>
                          <input
                            id={`${id}-kg`}
                            className="field tabular"
                            inputMode="decimal"
                            placeholder="kg"
                            value={row.weight}
                            onChange={(event) =>
                              setEntry(exercise.id, index, { weight: event.target.value })
                            }
                          />
                        </td>
                        <td className="py-1">
                          <label className="sr-only" htmlFor={`${id}-reps`}>
                            {exercise.name} set {index + 1} reps, aiming {target.label}
                          </label>
                          <input
                            id={`${id}-reps`}
                            className="field tabular"
                            inputMode="numeric"
                            placeholder={target.label}
                            value={row.reps}
                            onChange={(event) =>
                              setEntry(exercise.id, index, { reps: event.target.value })
                            }
                            style={hitTop ? { borderColor: "var(--good-ink)" } : undefined}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </li>
          );
        })}
      </ol>

      <div className="card space-y-3 p-4">
        <div className="space-y-1.5">
          <label htmlFor="workout-notes" className="text-sm font-medium">
            Notes <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="workout-notes"
            className="field min-h-20"
            value={draft.notes}
            onChange={(event) => setDraft((d) => ({ ...d, notes: event.target.value }))}
            placeholder="Felt strong, shoulder a bit tight, ..."
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || loggedSets === 0}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : `Save ${day.name}`}
          </button>
          <span className="text-sm text-ink-muted">
            {loggedSets === 0
              ? "Enter reps for the sets you did."
              : `${loggedSets} set${loggedSets === 1 ? "" : "s"} logged`}
          </span>
          {error && (
            <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
              {error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressNote({ progress }: { progress: Progress }) {
  if (progress.kind === "new") return null;
  if (progress.kind === "increase") {
    return (
      <p className="text-xs font-medium" style={{ color: "var(--good-ink)" }}>
        Top of the range on every set last time — go heavier.
      </p>
    );
  }
  return (
    <p className="text-xs text-ink-muted">
      Same weight: set{progress.short.length === 1 ? "" : "s"} {joinList(progress.short)} still
      short of the top of the range.
    </p>
  );
}

/** An unfinished workout saved on this device, fitted to the plan as it is now. */
function restore(key: string, fresh: Draft): Draft {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return fresh;
    const parsed = JSON.parse(saved) as Partial<Draft>;
    return {
      date: typeof parsed.date === "string" ? parsed.date : fresh.date,
      notes: typeof parsed.notes === "string" ? parsed.notes : fresh.notes,
      // Only exercises still in the plan, at their current number of sets.
      entries: Object.fromEntries(
        Object.entries(fresh.entries).map(([id, rows]) => [
          id,
          rows.map((row, index) => parsed.entries?.[id]?.[index] ?? row),
        ]),
      ),
    };
  } catch {
    // No storage (private browsing) or something unreadable: start fresh.
    return fresh;
  }
}

function hasAnyReps(draft: Draft): boolean {
  return Object.values(draft.entries).some((rows) => rows.some((row) => row.reps.trim() !== ""));
}

function parseWhole(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Blank means bodyweight. Accepts "22,5" as well as "22.5". */
function parseWeight(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const number = Number(trimmed);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

function joinList(numbers: number[]): string {
  if (numbers.length <= 1) return numbers.join("");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}
