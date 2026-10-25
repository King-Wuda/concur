"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { addDay, deleteDay, saveDay } from "@/app/workouts/actions";
import { SaveBar } from "@/components/SaveBar";
import type { WorkoutDayRow } from "@/lib/workout-data";
import { SCHEME_LABELS, SCHEMES, targetFor, type Scheme } from "@/lib/workouts";

type Row = { key: string; name: string; scheme: Scheme; sets: string };

/** One day of the plan: its name, what it focuses on, and its exercises in order. */
export function DayEditor({ day, canDelete }: { day: WorkoutDayRow; canDelete: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(day.name);
  const [focus, setFocus] = useState(day.focus ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    day.exercises.map((exercise) => ({
      key: exercise.id,
      name: exercise.name,
      scheme: exercise.scheme,
      sets: String(exercise.sets),
    })),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, patch: Partial<Row>) => {
    setStatus("idle");
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const move = (index: number, by: number) => {
    setStatus("idle");
    setRows((current) => {
      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  };

  async function save() {
    setError(null);
    const exercises = rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        scheme: row.scheme,
        sets: Math.min(10, Math.max(1, Number.parseInt(row.sets, 10) || 1)),
      }));
    setStatus("saving");
    const result = await saveDay({ dayId: day.id, name, focus: focus.trim() || null, exercises });
    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove ${day.name} from the plan? Workouts already logged stay.`)) return;
    const result = await deleteDay(day.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-1.5">
          <label htmlFor={`day-name-${day.id}`} className="text-sm font-medium">
            Day {day.code}
          </label>
          <input
            id={`day-name-${day.id}`}
            className="field"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setStatus("idle");
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`day-focus-${day.id}`} className="text-sm font-medium">
            Focus <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id={`day-focus-${day.id}`}
            className="field"
            value={focus}
            placeholder="Chest heavy → medium arms/shoulders"
            onChange={(event) => {
              setFocus(event.target.value);
              setStatus("idle");
            }}
          />
        </div>
      </div>

      <ol className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.key} className="rounded-lg bg-sunken p-3">
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_11rem_5rem_auto]">
              <div className="col-span-2 sm:col-span-1">
                <label className="sr-only" htmlFor={`${row.key}-name`}>
                  Exercise {index + 1}
                </label>
                <input
                  id={`${row.key}-name`}
                  className="field"
                  value={row.name}
                  placeholder="Exercise"
                  onChange={(event) => change(row.key, { name: event.target.value })}
                />
              </div>
              <div>
                <label className="sr-only" htmlFor={`${row.key}-scheme`}>
                  Scheme for {row.name || `exercise ${index + 1}`}
                </label>
                <select
                  id={`${row.key}-scheme`}
                  className="field"
                  value={row.scheme}
                  onChange={(event) => change(row.key, { scheme: event.target.value as Scheme })}
                >
                  {SCHEMES.map((scheme) => (
                    <option key={scheme} value={scheme}>
                      {scheme} · {SCHEME_LABELS[scheme]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="sr-only" htmlFor={`${row.key}-sets`}>
                  Sets for {row.name || `exercise ${index + 1}`}
                </label>
                <input
                  id={`${row.key}-sets`}
                  className="field tabular"
                  inputMode="numeric"
                  value={row.sets}
                  onChange={(event) => change(row.key, { sets: event.target.value })}
                />
              </div>
              <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
                <button
                  type="button"
                  className="btn !px-2"
                  aria-label={`Move ${row.name || "exercise"} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn !px-2"
                  aria-label={`Move ${row.name || "exercise"} down`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn !px-2"
                  aria-label={`Remove ${row.name || "exercise"}`}
                  onClick={() => {
                    setStatus("idle");
                    setRows((current) => current.filter((r) => r.key !== row.key));
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted tabular">
              {Array.from(
                { length: Math.min(10, Math.max(1, Number.parseInt(row.sets, 10) || 1)) },
                (_, i) => targetFor(row.scheme, i + 1).label,
              ).join(" · ")}
            </p>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="btn"
        onClick={() => {
          setStatus("idle");
          setRows((current) => [
            ...current,
            { key: crypto.randomUUID(), name: "", scheme: "RPT", sets: "3" },
          ]);
        }}
      >
        Add exercise
      </button>

      <SaveBar status={status} error={error} onSave={save} label={`Save ${name || "day"}`}>
        {canDelete && (
          <button type="button" className="btn btn-danger ml-auto" onClick={() => void remove()}>
            Remove day
          </button>
        )}
      </SaveBar>
    </section>
  );
}

export function AddDayButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await addDay();
          setBusy(false);
          if (!result.ok) setError(result.error);
          else router.refresh();
        }}
      >
        {busy ? "Adding..." : "Add a workout day"}
      </button>
      {error && (
        <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
