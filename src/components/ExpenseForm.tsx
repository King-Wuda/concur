"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveReceipt, type SaveReceiptInput } from "@/app/budget/actions";
import {
  LineItemEditor,
  linesPayload,
  linesTotal,
  type DraftLineItem,
} from "@/components/LineItemEditor";
import { useTrip, type Trip } from "@/components/TripContext";
import { CATEGORIES, type Category } from "@/lib/categories";
import { EVENT_CATEGORIES, guessEventCategory, isEventCategory } from "@/lib/events";
import { formatRand, parseRand } from "@/lib/money";
import { useMonthStarts } from "@/components/BudgetCalendar";
import { formatMonthLong, isIsoDate, type MonthKey } from "@/lib/month";
import { budgetMonthFor, defaultDateIn, type MonthStart } from "@/lib/period";

/**
 * The fields an expense is confirmed in, whether it came off a photographed
 * receipt or was typed from memory.
 *
 * Every route ends up in these same fields on purpose: a scanned receipt is only
 * ever a filled-in draft of them, so typing and scanning cannot drift apart in
 * what they save, how they balance line items, or how a category change
 * re-homes them.
 *
 * `ExpenseFields` is controlled - it holds no state - so a screen confirming a
 * whole batch of receipts can keep every draft itself and save them together.
 * `ExpenseForm` wraps it with state and save buttons for the one-at-a-time case.
 */

export type ExpenseValues = {
  storeName: string;
  date: string;
  total: string;
  category: Category;
  note: string;
  items: DraftLineItem[];
  /** On a trip: the participant who paid ("" for you) and the trip category ("" to guess). */
  paidBy?: string;
  eventCategory?: string;
};

export function emptyExpense(
  monthKey: MonthKey,
  starts: readonly MonthStart[],
): ExpenseValues {
  return {
    storeName: "",
    date: defaultDateIn(monthKey, starts),
    total: "",
    category: "Groceries",
    note: "",
    items: [],
  };
}

/**
 * The budget month an expense will land in: the pay period its own date falls
 * in, so 25 September is October's. Shown beside the save button so a receipt
 * from last month says so before it goes.
 */
export function filingMonth(
  values: ExpenseValues,
  fallback: MonthKey,
  starts: readonly MonthStart[],
): MonthKey {
  return isIsoDate(values.date) ? budgetMonthFor(values.date, starts) : fallback;
}

/**
 * What the expense comes to: the sum of its lines when it has any - the total
 * is locked to them - otherwise the total typed in.
 */
/**
 * Where a receipt will be saved, in words: its budget month, or for a trip,
 * the trip - and the month too only when you paid.
 */
export function savingTo(values: ExpenseValues, month: MonthKey, trip: Trip | null): string {
  if (!trip) return formatMonthLong(month);
  const payer = trip.participants.find((p) => p.id === values.paidBy);
  return payer && !payer.is_me
    ? `${trip.name} only (${payer.name} paid)`
    : `${trip.name} and ${formatMonthLong(month)}`;
}

export function expenseTotal(values: Pick<ExpenseValues, "total" | "items">): number {
  return values.items.length > 0 ? linesTotal(values.items) : parseRand(values.total);
}

/** Turns what is on screen into what the save action takes. */
export function expensePayload(
  values: ExpenseValues,
  extras: { imagePath?: string | null; rawExtraction?: unknown; trip?: Trip | null } = {},
): SaveReceiptInput {
  return {
    store_name: values.storeName.trim() || "Unknown store",
    date: values.date,
    total: expenseTotal(values),
    category: values.category,
    note: values.note.trim() || null,
    image_path: extras.imagePath ?? null,
    raw_extraction: extras.rawExtraction ?? null,
    line_items: linesPayload(values.items),
    trip: extras.trip
      ? {
          event_id: extras.trip.id,
          paid_by: values.paidBy || null,
          event_category: isEventCategory(values.eventCategory) ? values.eventCategory : null,
        }
      : null,
  };
}

export function ExpenseFields({
  values,
  onChange,
  idPrefix = "",
  storeLabel = "Store",
  storePlaceholder = "Checkers Hyper",
  autoFocusTotal = false,
}: {
  values: ExpenseValues;
  onChange: (values: ExpenseValues) => void;
  /** Keeps element ids unique when several of these are on one page. */
  idPrefix?: string;
  storeLabel?: string;
  storePlaceholder?: string;
  autoFocusTotal?: boolean;
}) {
  const set = (patch: Partial<ExpenseValues>) => onChange({ ...values, ...patch });
  const id = (name: string) => `${idPrefix}${name}`;

  const locked = values.items.length > 0;
  const trip = useTrip();

  /** Re-categorising the expense re-homes items that still match the old one. */
  function changeCategory(next: Category) {
    set({
      category: next,
      items: values.items.map((item) =>
        item.category === values.category ? { ...item, category: next } : item,
      ),
    });
  }

  return (
    <div className="space-y-4">
      {trip && (
        <div className="card space-y-3 p-4" style={{ borderColor: "var(--accent)" }}>
          <p className="text-sm font-medium">
            On <span className="text-accent">{trip.name}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={id("paid-by")} className="text-sm font-medium">
                Paid by
              </label>
              <select
                id={id("paid-by")}
                className="field"
                value={values.paidBy || trip.participants.find((p) => p.is_me)?.id || ""}
                onChange={(event) => set({ paidBy: event.target.value })}
              >
                {trip.participants.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.is_me ? "You" : person.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={id("trip-category")} className="text-sm font-medium">
                Trip category
              </label>
              <select
                id={id("trip-category")}
                className="field"
                value={
                  isEventCategory(values.eventCategory)
                    ? values.eventCategory
                    : guessEventCategory(values.category)
                }
                onChange={(event) => set({ eventCategory: event.target.value })}
              >
                {EVENT_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            {(() => {
              const payer = trip.participants.find((p) => p.id === values.paidBy);
              return payer && !payer.is_me
                ? `Paid by ${payer.name}: counts on the trip only, not in your monthly budget.`
                : "Paid by you: counts on the trip and in your monthly budget.";
            })()}
          </p>
        </div>
      )}

      <div className="card space-y-3 p-4">
        <div className="space-y-1.5">
          <label htmlFor={id("store")} className="text-sm font-medium">
            {storeLabel}
          </label>
          <input
            id={id("store")}
            className="field"
            value={values.storeName}
            onChange={(event) => set({ storeName: event.target.value })}
            placeholder={storePlaceholder}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={id("date")} className="text-sm font-medium">
              Date
            </label>
            <input
              id={id("date")}
              type="date"
              className="field"
              value={values.date}
              onChange={(event) => set({ date: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={id("total")} className="text-sm font-medium">
              Total paid
              {locked && (
                <span className="font-normal text-ink-muted"> (sum of the items)</span>
              )}
            </label>
            <input
              id={id("total")}
              className={`field field-money ${locked ? "bg-sunken" : ""}`}
              inputMode="decimal"
              autoFocus={autoFocusTotal && !locked}
              readOnly={locked}
              value={locked ? linesTotal(values.items).toFixed(2) : values.total}
              onChange={(event) => set({ total: event.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={id("category")} className="text-sm font-medium">
            Category
          </label>
          <select
            id={id("category")}
            className="field"
            value={values.category}
            onChange={(event) => changeCategory(event.target.value as Category)}
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={id("note")} className="text-sm font-medium">
            Note <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id={id("note")}
            className="field"
            value={values.note}
            onChange={(event) => set({ note: event.target.value })}
            placeholder="Paid partly with a gift card"
          />
        </div>
      </div>

      <LineItemEditor
        items={values.items}
        onChange={(items) => set({ items })}
        fallbackCategory={values.category}
      />
    </div>
  );
}

/** One expense, typed by hand, with its own save buttons. */
export function ExpenseForm({
  monthKey,
  initial,
  notice = null,
  storeLabel,
  storePlaceholder,
  submitLabel = "Save expense",
  onSavedAndContinue,
}: {
  monthKey: MonthKey;
  initial: ExpenseValues;
  /** Anything worth saying above the fields. */
  notice?: React.ReactNode;
  storeLabel?: string;
  storePlaceholder?: string;
  submitLabel?: string;
  /** Called after "save and add another", so the caller can set up the next one. */
  onSavedAndContinue: (savedName: string) => void;
}) {
  const router = useRouter();
  const trip = useTrip();
  const starts = useMonthStarts();

  const [values, setValues] = useState<ExpenseValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(andAnother: boolean) {
    setError(null);
    setSaving(true);
    const result = await saveReceipt(expensePayload(values, { trip }));
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (andAnother) {
      onSavedAndContinue(values.storeName.trim() || "Expense");
      router.refresh();
      return;
    }

    router.push(trip ? `/budget/events/${trip.id}` : `/budget?m=${monthKey}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {notice}

      <ExpenseFields
        values={values}
        onChange={setValues}
        storeLabel={storeLabel}
        storePlaceholder={storePlaceholder}
        autoFocusTotal
      />

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save(false)}
        >
          {saving ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={() => void save(true)}
        >
          Save and add another
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        Saving to {savingTo(values, filingMonth(values, monthKey, starts), trip)} ·{" "}
        {formatRand(expenseTotal(values))} total
      </p>
    </div>
  );
}
