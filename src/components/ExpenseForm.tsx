"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveReceipt } from "@/app/actions";
import { LineItemEditor, type DraftLineItem } from "@/components/LineItemEditor";
import { CATEGORIES, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import { defaultDateInMonth, formatMonthLong, type MonthKey } from "@/lib/month";

/**
 * The form an expense is confirmed in, whether it came off a photographed
 * receipt or was typed from memory.
 *
 * Both routes end up here on purpose: a scanned receipt is only ever a filled-in
 * draft of this form, so the two cannot drift apart in what they save, how they
 * balance line items, or how they treat a category change.
 *
 * It owns its own state. To load a different draft into it, give it a new React
 * `key` and it remounts with the new values - simpler than threading every
 * field back up to a parent that has no use for them.
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

export function ExpenseForm({
  monthKey,
  initial,
  imagePath = null,
  rawExtraction = null,
  preview = null,
  notice = null,
  storeLabel = "Store",
  storePlaceholder = "Checkers Hyper",
  submitLabel = "Save expense",
  secondaryAction,
  onSavedAndContinue,
}: {
  monthKey: MonthKey;
  initial: ExpenseValues;
  imagePath?: string | null;
  /** The model's raw output, kept alongside the receipt for auditing. */
  rawExtraction?: unknown;
  /** The uploaded file, shown beside the fields. */
  preview?: React.ReactNode;
  /** Anything worth saying above the fields, e.g. a low-confidence warning. */
  notice?: React.ReactNode;
  storeLabel?: string;
  storePlaceholder?: string;
  submitLabel?: string;
  secondaryAction?: { label: string; onClick: () => void };
  /** Called after "save and add another", so the caller can set up the next one. */
  onSavedAndContinue: (savedName: string) => void;
}) {
  const router = useRouter();

  const [storeName, setStoreName] = useState(initial.storeName);
  const [date, setDate] = useState(initial.date);
  const [total, setTotal] = useState(initial.total);
  const [category, setCategory] = useState<Category>(initial.category);
  const [note, setNote] = useState(initial.note);
  const [items, setItems] = useState<DraftLineItem[]>(initial.items);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemsTotal = sum(items.map((item) => parseRand(item.amount)));
  const parsedTotal = parseRand(total);

  /** Re-categorising the expense re-homes items that still match the old one. */
  function changeCategory(next: Category) {
    setItems((current) =>
      current.map((item) => (item.category === category ? { ...item, category: next } : item)),
    );
    setCategory(next);
  }

  async function save(andAnother: boolean) {
    setError(null);
    setSaving(true);

    const result = await saveReceipt({
      monthKey,
      store_name: storeName.trim() || "Unknown store",
      date,
      total: parsedTotal,
      category,
      note: note.trim() || null,
      image_path: imagePath,
      raw_extraction: rawExtraction,
      line_items: items
        .filter((item) => item.item_name.trim().length > 0)
        .map((item) => ({
          item_name: item.item_name.trim(),
          amount: parseRand(item.amount),
          quantity: item.quantity.trim() ? parseRand(item.quantity) : null,
          category: item.category,
        })),
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (andAnother) {
      onSavedAndContinue(storeName.trim() || "Expense");
      router.refresh();
      return;
    }

    router.push(`/?m=${monthKey}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {notice}

      <div
        className={
          preview
            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
            : "mx-auto w-full max-w-2xl"
        }
      >
        {preview}

        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <div className="space-y-1.5">
              <label htmlFor="store" className="text-sm font-medium">
                {storeLabel}
              </label>
              <input
                id="store"
                className="field"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                placeholder={storePlaceholder}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="date" className="text-sm font-medium">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  className="field"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="total" className="text-sm font-medium">
                  Total paid
                </label>
                <input
                  id="total"
                  className="field field-money"
                  inputMode="decimal"
                  autoFocus={!preview}
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                className="field"
                value={category}
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
              <label htmlFor="note" className="text-sm font-medium">
                Note <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id="note"
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Paid partly with a gift card"
              />
            </div>
          </div>

          <LineItemEditor
            items={items}
            onChange={setItems}
            fallbackCategory={category}
            itemsTotal={itemsTotal}
            difference={round2(parsedTotal - itemsTotal)}
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
            {secondaryAction && (
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            )}
          </div>

          <p className="text-xs text-ink-muted">
            Saving to {formatMonthLong(monthKey)} · {formatRand(parsedTotal)} total
          </p>
        </div>
      </div>
    </div>
  );
}
