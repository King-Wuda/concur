"use client";

import { CATEGORIES, CATEGORY_COLOR_VAR, type Category } from "@/lib/categories";
import { formatRand } from "@/lib/money";

/**
 * Editable list of a receipt's line items.
 *
 * Amounts stay as strings while being typed so a half-finished number is never
 * silently rewritten under the cursor; they are parsed once on save. Each item
 * can carry its own category, which is what makes a mixed ride-share and food
 * delivery screenshot land in the right places.
 */

export type DraftLineItem = {
  /** Stable key for React; not persisted. */
  key: string;
  item_name: string;
  amount: string;
  quantity: string;
  category: Category;
};

export function newLineItem(category: Category): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    item_name: "",
    amount: "",
    quantity: "",
    category,
  };
}

export function LineItemEditor({
  items,
  onChange,
  fallbackCategory,
  itemsTotal,
  difference,
}: {
  items: DraftLineItem[];
  onChange: (items: DraftLineItem[]) => void;
  fallbackCategory: Category;
  itemsTotal: number;
  /** Receipt total minus the line items total. */
  difference: number;
}) {
  const update = (key: string, patch: Partial<DraftLineItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const remove = (key: string) => onChange(items.filter((item) => item.key !== key));

  const balanced = Math.abs(difference) < 0.005;

  return (
    <section className="card p-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold">Line items</h2>
          <p className="text-sm text-ink-secondary">
            {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
            <span className="tabular">{formatRand(itemsTotal)}</span>
          </p>
        </div>
        <button
          type="button"
          className="btn !min-h-9 !px-3 !py-1.5 !text-sm"
          onClick={() => onChange([...items, newLineItem(fallbackCategory)])}
        >
          Add item
        </button>
      </header>

      {items.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">
          No individual items — the receipt total alone will be recorded.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.key}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem_2.5rem] items-start gap-2"
            >
              <div className="space-y-2">
                <input
                  className="field"
                  value={item.item_name}
                  aria-label="Item name"
                  placeholder="Item"
                  onChange={(event) => update(item.key, { item_name: event.target.value })}
                />
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: CATEGORY_COLOR_VAR[item.category] }}
                  />
                  <select
                    className="field !py-1.5 !text-sm"
                    value={item.category}
                    aria-label={`Category for ${item.item_name || "this item"}`}
                    onChange={(event) =>
                      update(item.key, { category: event.target.value as Category })
                    }
                  >
                    {CATEGORIES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field !w-20 !py-1.5 !text-sm field-money"
                    inputMode="decimal"
                    aria-label={`Quantity for ${item.item_name || "this item"}`}
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(event) => update(item.key, { quantity: event.target.value })}
                  />
                </div>
              </div>

              <input
                className="field field-money"
                inputMode="decimal"
                aria-label={`Amount for ${item.item_name || "this item"}`}
                placeholder="0.00"
                value={item.amount}
                onChange={(event) => update(item.key, { amount: event.target.value })}
              />

              <button
                type="button"
                className="btn !min-h-11 !w-10 !p-0"
                aria-label={`Remove ${item.item_name || "this item"}`}
                onClick={() => remove(item.key)}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!balanced && items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: "var(--ink-secondary)" }}>
            The items are {formatRand(Math.abs(difference))}{" "}
            {difference > 0 ? "short of" : "over"} the total.
          </span>
          <button
            type="button"
            className="btn !min-h-9 !px-3 !py-1.5 !text-sm"
            onClick={() =>
              onChange([
                ...items,
                {
                  ...newLineItem(fallbackCategory),
                  item_name: difference > 0 ? "Unlisted / VAT / rounding" : "Discount",
                  amount: String(difference),
                },
              ])
            }
          >
            Add the difference as a line
          </button>
        </div>
      )}

      {!balanced && items.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          It is fine to leave this unbalanced — the difference is counted under the
          receipt&apos;s own category, so the month still adds up.
        </p>
      )}
    </section>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
