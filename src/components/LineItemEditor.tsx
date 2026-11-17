"use client";

import {
  CategoryOptions,
  useCategoryColor,
} from "@/components/CategoriesContext";
import { useTrip } from "@/components/TripContext";
import type { Category } from "@/lib/categories";
import { formatRand, parseDecimal, parseRand, round2, sum } from "@/lib/money";

/**
 * Editable list of a receipt's line items.
 *
 * Each line is a price and a quantity; its amount is the two multiplied, and
 * the receipt's total is the sum of its lines - so adding a second item, or
 * changing a quantity from 1 to 3, moves the total with it.
 *
 * Numbers stay as strings while being typed so a half-finished number is never
 * silently rewritten under the cursor. Each item can carry its own category,
 * which is what makes a mixed ride-share and food delivery screenshot land in
 * the right places.
 */

export type DraftLineItem = {
  /** Stable key for React; not persisted. */
  key: string;
  item_name: string;
  /** Price of one, as typed. */
  price: string;
  /** How many, as typed; blank means one. */
  quantity: string;
  category: Category;
};

export function newLineItem(category: Category): DraftLineItem {
  return {
    key: crypto.randomUUID(),
    item_name: "",
    price: "",
    quantity: "",
    category,
  };
}

/** The quantity as a number: blank or nonsense counts as one. */
export function quantityOf(item: Pick<DraftLineItem, "quantity">): number {
  const qty = parseRand(item.quantity);
  return qty > 0 ? qty : 1;
}

/** Price times quantity, to the cent. */
export function lineTotal(
  item: Pick<DraftLineItem, "price" | "quantity">,
): number {
  return round2(parseDecimal(item.price) * quantityOf(item));
}

/** What the receipt's total is whenever it has lines: their sum. */
export function linesTotal(items: readonly DraftLineItem[]): number {
  return sum(items.map(lineTotal));
}

/**
 * A saved or scanned line (an amount for the whole line, and maybe a
 * quantity) as a draft: the price of one is the amount over the quantity.
 */
export function draftLine(
  line: {
    item_name: string;
    amount: number;
    quantity: number | null;
    category: Category;
  },
  key: string,
): DraftLineItem {
  const qty = line.quantity && line.quantity > 0 ? line.quantity : 1;
  const price = Math.round((Number(line.amount) / qty) * 10000) / 10000;
  return {
    key,
    item_name: line.item_name,
    price: String(price),
    quantity: qty === 1 ? "" : String(qty),
    category: line.category,
  };
}

/**
 * Lines as the save actions take them. Empty-named lines are dropped. A
 * quantity of one is stored as none, as it always has been.
 */
export function linesPayload(items: readonly DraftLineItem[]) {
  return items
    .filter((item) => item.item_name.trim().length > 0)
    .map((item) => ({
      item_name: item.item_name.trim(),
      amount: lineTotal(item),
      quantity: quantityOf(item) === 1 ? null : quantityOf(item),
      category: item.category,
    }));
}

/**
 * When a receipt's lines do not add up to its printed total - VAT shown
 * separately, rounding, a line the reader could not make out - the gap is
 * added as a line of its own, so that a total locked to its lines still
 * matches the slip.
 */
export function withBalancingLine(
  items: DraftLineItem[],
  total: number,
  category: Category,
): DraftLineItem[] {
  if (items.length === 0) return items;
  const gap = round2(total - linesTotal(items));
  if (Math.abs(gap) < 0.005) return items;
  return [
    ...items,
    {
      ...newLineItem(category),
      key: `balance-${items.length}`,
      item_name: gap > 0 ? "Unlisted / VAT / rounding" : "Discount",
      price: String(gap),
    },
  ];
}

export function LineItemEditor({
  items,
  onChange,
  fallbackCategory,
}: {
  items: DraftLineItem[];
  onChange: (items: DraftLineItem[]) => void;
  fallbackCategory: Category;
}) {
  const itemsTotal = linesTotal(items);
  const colorFor = useCategoryColor();
  // On a trip every line counts under the trip's category, so there is no
  // category to pick per line.
  const trip = useTrip();
  const update = (key: string, patch: Partial<DraftLineItem>) =>
    onChange(
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );

  const remove = (key: string) =>
    onChange(items.filter((item) => item.key !== key));

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
          No individual items — type the total above. Add items and the total
          becomes their sum.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="space-y-2 rounded-lg bg-sunken p-2.5">
              <div className="flex items-start gap-2">
                <input
                  className="field"
                  value={item.item_name}
                  aria-label="Item name"
                  placeholder="Item"
                  onChange={(event) =>
                    update(item.key, { item_name: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="btn !min-h-11 !w-10 shrink-0 !p-0"
                  aria-label={`Remove ${item.item_name || "this item"}`}
                  onClick={() => remove(item.key)}
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-2">
                <input
                  className="field field-money"
                  inputMode="decimal"
                  aria-label={`Price of one ${item.item_name || "item"}`}
                  placeholder="Price"
                  value={item.price}
                  onChange={(event) =>
                    update(item.key, { price: event.target.value })
                  }
                />
                <div className="relative">
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-muted"
                  >
                    ×
                  </span>
                  <input
                    className="field field-money !pl-6"
                    inputMode="decimal"
                    aria-label={`Quantity of ${item.item_name || "this item"}`}
                    placeholder="1"
                    value={item.quantity}
                    onChange={(event) =>
                      update(item.key, { quantity: event.target.value })
                    }
                  />
                </div>
                <span className="text-right text-sm font-medium tabular">
                  = {formatRand(lineTotal(item))}
                </span>
              </div>
              {!trip && (
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ background: colorFor(item.category) }}
                  />
                  <select
                    className="field !py-1.5 !text-sm"
                    value={item.category}
                    aria-label={`Category for ${item.item_name || "this item"}`}
                    onChange={(event) =>
                      update(item.key, {
                        category: event.target.value as Category,
                      })
                    }
                  >
                    <CategoryOptions current={item.category} />
                  </select>
                </div>
              )}
            </li>
          ))}
        </ul>
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
