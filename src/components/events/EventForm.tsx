"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createEvent, updateEvent } from "@/app/budget/events/actions";
import { MoneyField } from "@/components/MoneyField";
import { EVENT_CATEGORIES, type EventCategory } from "@/lib/events";
import { formatRand, parseRand, round2, sum } from "@/lib/money";

type Initial = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  notes: string | null;
  budgets: Partial<Record<EventCategory, number>>;
};

const asField = (n: number | undefined) => (n ? String(round2(n)) : "");

/**
 * A trip or event's details: name, dates, the budget, and optionally how
 * that budget splits by category. New ones also take the other people going.
 */
export function EventForm({ initial, onDone }: { initial?: Initial; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [start, setStart] = useState(initial?.start_date ?? "");
  const [end, setEnd] = useState(initial?.end_date ?? "");
  const [budget, setBudget] = useState(asField(initial?.budget));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [byCategory, setByCategory] = useState<Record<EventCategory, string>>(
    () =>
      Object.fromEntries(
        EVENT_CATEGORIES.map((c) => [c, asField(initial?.budgets[c])]),
      ) as Record<EventCategory, string>,
  );
  const [people, setPeople] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoriesTotal = sum(EVENT_CATEGORIES.map((c) => parseRand(byCategory[c])));

  async function save() {
    setError(null);
    setSaving(true);
    const fields = {
      name,
      start_date: start || null,
      end_date: end || null,
      // No total typed but categories set: the total is their sum.
      budget: parseRand(budget) || categoriesTotal,
      notes: notes.trim() || null,
      category_budgets: Object.fromEntries(
        EVENT_CATEGORIES.map((c) => [c, parseRand(byCategory[c])]),
      ),
    };
    const result = initial
      ? await updateEvent({ ...fields, id: initial.id })
      : await createEvent({ ...fields, participants: people });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.();
    if (!initial && result.data) router.push(`/budget/events/${result.data.id}`);
    else router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      {!initial && <h2 className="font-semibold">New trip or event</h2>}

      <div className="space-y-1.5">
        <label htmlFor="event-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="event-name"
          className="field"
          value={name}
          placeholder="Cape Town trip, Thabo's wedding..."
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="event-start" className="text-sm font-medium">
            From
          </label>
          <input
            id="event-start"
            type="date"
            className="field"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="event-end" className="text-sm font-medium">
            To
          </label>
          <input
            id="event-end"
            type="date"
            className="field"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>

      <MoneyField
        id="event-budget"
        label="Budget for the whole trip"
        value={budget}
        onChange={setBudget}
        hint={
          categoriesTotal > 0
            ? `Categories below add up to ${formatRand(categoriesTotal)}`
            : "What the trip should cost, everyone's share included"
        }
        action={
          categoriesTotal > 0 && Math.abs(categoriesTotal - parseRand(budget)) >= 0.01
            ? { label: "Use their sum", onClick: () => setBudget(String(categoriesTotal)) }
            : undefined
        }
      />

      <details className="rounded-lg bg-sunken p-3" open={categoriesTotal > 0}>
        <summary className="cursor-pointer text-sm font-medium">
          Budget by category <span className="font-normal text-ink-muted">(optional)</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {EVENT_CATEGORIES.map((category) => (
            <MoneyField
              key={category}
              id={`event-budget-${category.toLowerCase()}`}
              label={category}
              value={byCategory[category]}
              onChange={(value) => setByCategory((current) => ({ ...current, [category]: value }))}
            />
          ))}
        </div>
      </details>

      {!initial && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Who else is going</legend>
          <p className="text-xs text-ink-muted">
            You are included. Costs are split equally between everyone.
          </p>
          {people.map((person, index) => (
            <div key={index} className="flex gap-2">
              <label className="sr-only" htmlFor={`person-${index}`}>
                Person {index + 1}
              </label>
              <input
                id={`person-${index}`}
                className="field"
                value={person}
                placeholder="Name"
                onChange={(e) =>
                  setPeople((current) => current.map((p, i) => (i === index ? e.target.value : p)))
                }
              />
              {people.length > 1 && (
                <button
                  type="button"
                  className="btn !px-3"
                  aria-label={`Remove ${person || "this person"}`}
                  onClick={() => setPeople((current) => current.filter((_, i) => i !== index))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-accent underline underline-offset-4"
            onClick={() => setPeople((current) => [...current, ""])}
          >
            Add another person
          </button>
        </fieldset>
      )}

      <div className="space-y-1.5">
        <label htmlFor="event-notes" className="text-sm font-medium">
          Notes <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id="event-notes"
          className="field"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !name.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : initial ? "Save" : "Create"}
        </button>
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            Cancel
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

/** "New trip or event" button that opens the form in place. */
export function NewEventButton({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (open) return <EventForm onDone={startOpen ? undefined : () => setOpen(false)} />;
  return (
    <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
      New trip or event
    </button>
  );
}
