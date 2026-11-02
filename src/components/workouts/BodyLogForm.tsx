"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveBodyLog } from "@/app/workouts/actions";
import { formatSteps } from "@/lib/body";

/**
 * Two small entries for one day: weight in the morning, steps at night. Each
 * saves on its own, so logging steps later never touches the morning's weight.
 */
export function BodyLogForm({
  date,
  today,
  dateLabel,
  weight,
  steps,
}: {
  date: string;
  today: string;
  dateLabel: string;
  weight: number | null;
  steps: number | null;
}) {
  const router = useRouter();
  const [weightText, setWeightText] = useState(
    weight === null ? "" : String(weight),
  );
  const [stepsText, setStepsText] = useState(
    steps === null ? "" : String(steps),
  );
  const [busy, setBusy] = useState<"weight" | "steps" | null>(null);
  const [message, setMessage] = useState<{
    field: "weight" | "steps";
    text: string;
    ok: boolean;
  } | null>(null);

  async function save(field: "weight" | "steps") {
    setMessage(null);
    const raw = (field === "weight" ? weightText : stepsText)
      .trim()
      .replace(",", ".")
      .replace(/\s/g, "");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setMessage({ field, text: "That is not a number.", ok: false });
      return;
    }
    setBusy(field);
    const result = await saveBodyLog(
      field === "weight"
        ? {
            date,
            weight_kg: value === null ? null : Math.round(value * 10) / 10,
          }
        : { date, steps: value === null ? null : Math.round(value) },
    );
    setBusy(null);
    if (!result.ok) {
      setMessage({ field, text: result.error, ok: false });
      return;
    }
    setMessage({ field, text: "Saved.", ok: true });
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{dateLabel}</h2>
        <input
          type="date"
          className="field max-w-[11rem]"
          aria-label="Day to log"
          value={date}
          max={today}
          onChange={(event) =>
            event.target.value &&
            router.push(
              event.target.value === today
                ? "/workouts/body"
                : `/workouts/body?d=${event.target.value}`,
            )
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Entry
          id="body-weight"
          label="Morning weight"
          unit="kg"
          inputMode="decimal"
          placeholder="82.4"
          value={weightText}
          onChange={setWeightText}
          onSave={() => void save("weight")}
          busy={busy === "weight"}
          saved={weight === null ? null : `${weight} kg saved`}
          message={message?.field === "weight" ? message : null}
        />
        <Entry
          id="body-steps"
          label="Steps"
          unit="steps"
          inputMode="numeric"
          placeholder="10000"
          value={stepsText}
          onChange={setStepsText}
          onSave={() => void save("steps")}
          busy={busy === "steps"}
          saved={steps === null ? null : `${formatSteps(steps)} saved`}
          message={message?.field === "steps" ? message : null}
        />
      </div>
    </section>
  );
}

function Entry({
  id,
  label,
  unit,
  inputMode,
  placeholder,
  value,
  onChange,
  onSave,
  busy,
  saved,
  message,
}: {
  id: string;
  label: string;
  unit: string;
  inputMode: "decimal" | "numeric";
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  busy: boolean;
  saved: string | null;
  message: { text: string; ok: boolean } | null;
}) {
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            className="field tabular !pr-14"
            inputMode={inputMode}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-muted"
          >
            {unit}
          </span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
      <p
        className="text-xs"
        role={message ? (message.ok ? "status" : "alert") : undefined}
        style={
          message && !message.ok ? { color: "var(--critical)" } : undefined
        }
      >
        {message ? (
          message.text
        ) : (
          <span className="text-ink-muted">{saved ?? "Not logged yet"}</span>
        )}
      </p>
    </form>
  );
}
