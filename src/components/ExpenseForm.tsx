"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveReceipt, type SaveReceiptInput } from "@/app/actions";
import { LineItemEditor, type DraftLineItem } from "@/components/LineItemEditor";
import { CATEGORIES, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import {
  dateToMonthKey,
  defaultDateInMonth,
  formatMonthLong,
  isIsoDate,
  type MonthKey,
} from "@/lib/month";

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
};

export function emptyExpense(monthKey: MonthKey): ExpenseValues {
  return {
    storeName: "",
    date: defaultDateInMonth(monthKey),
    total: "",
    category: "Groceries",
    note: "",
    items: [],
  };
}

/**
 * The month an expense will land in: the one its own date falls in. Shown
 * beside the save button so a receipt from last month says so before it goes.
 */
export function filingMonth(values: ExpenseValues, fallback: MonthKey): MonthKey {
  return isIsoDate(values.date) ? dateToMonthKey(values.date) : fallback;
}

/** Turns what is on screen into what the save action takes. */
export function expensePayload(
  values: ExpenseValues,
  extras: { imagePath?: string | null; rawExtraction?: unknown } = {},
): SaveReceiptInput {
  return {
    store_name: values.storeName.trim() || "Unknown store",
    date: values.date,
    total: parseRand(values.total),
    category: values.category,
    note: values.note.trim() || null,
    image_path: extras.imagePath ?? null,
    raw_extraction: extras.rawExtraction ?? null,
    line_items: values.items
      .filter((item) => item.item_name.trim().length > 0)
      .map((item) => ({
        item_name: item.item_name.trim(),
        amount: parseRand(item.amount),
        quantity: item.quantity.trim() ? parseRand(item.quantity) : null,
        category: item.category,
      })),
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

  const itemsTotal = sum(values.items.map((item) => parseRand(item.amount)));
  const parsedTotal = parseRand(values.total);

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
            </label>
            <input
              id={id("total")}
              className="field field-money"
              inputMode="decimal"
              autoFocus={autoFocusTotal}
              value={values.total}
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
        itemsTotal={itemsTotal}
        difference={round2(parsedTotal - itemsTotal)}
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

  const [values, setValues] = useState<ExpenseValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(andAnother: boolean) {
    setError(null);
    setSaving(true);
    const result = await saveReceipt(expensePayload(values));
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

    router.push(`/?m=${monthKey}`);
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
        Saving to {formatMonthLong(filingMonth(values, monthKey))} ·{" "}
        {formatRand(parseRand(values.total))} total
      </p>
    </div>
  );
}
