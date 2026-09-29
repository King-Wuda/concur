"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveFixedExpenses } from "@/app/actions";
import { SaveBar } from "@/components/SaveBar";
import { CATEGORIES, CATEGORY_COLOR_VAR, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import type { MonthKey } from "@/lib/month";
import type { FixedExpenseRow } from "@/lib/types";

/**
 * The recurring monthly lines - gym, MMA, Claude, VPS, iCloud, Spotify and
 * anything else. These count toward their category's actuals by default, so a
 * Subscriptions budget covers them without any receipts being scanned.
 */

type DraftFixed = {
  key: string;
  name: string;
  amount: string;
  category: Category;
  include_in_budget: boolean;
};

export function FixedExpensesForm({
  monthKey,
  items,
}: {
  monthKey: MonthKey;
  items: FixedExpenseRow[];
}) {
  const router = useRouter();

  const [rows, setRows] = useState<DraftFixed[]>(() =>
    items.map((item) => ({
      key: item.id,
      name: item.name,
      amount: Number(item.amount) === 0 ? "" : String(round2(Number(item.amount))),
      category: item.category,
      include_in_budget: item.include_in_budget,
    })),
  );

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const total = sum(rows.map((row) => parseRand(row.amount)));

  const update = (key: string, patch: Partial<DraftFixed>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  async function save() {
    setStatus("saving");
    setError(null);

    const named = rows.filter((row) => row.name.trim().length > 0);

    const result = await saveFixedExpenses({
      monthKey,
      items: named.map((row) => ({
        name: row.name.trim(),
        amount: parseRand(row.amount),
        category: row.category,
        include_in_budget: row.include_in_budget,
      })),
    });

    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }

    setStatus("saved");
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold">Subscriptions and fixed expenses</h2>
          <p className="text-sm text-ink-secondary">
            Counted in their category&apos;s actuals, so no receipt is needed.
          </p>
        </div>
        <span className="tabular text-sm font-medium">{formatRand(total)} / month</span>
      </header>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_6rem_2.5rem] items-start gap-2"
          >
            <div className="space-y-2">
              <input
                className="field"
                value={row.name}
                aria-label="Name"
                placeholder="Spotify"
                onChange={(event) => update(row.key, { name: event.target.value })}
              />
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ background: CATEGORY_COLOR_VAR[row.category] }}
                />
                <select
                  className="field !py-1.5 !text-sm"
                  value={row.category}
                  aria-label={`Category for ${row.name || "this line"}`}
                  onChange={(event) =>
                    update(row.key, { category: event.target.value as Category })
                  }
                >
                  {CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={row.include_in_budget}
                    onChange={(event) =>
                      update(row.key, { include_in_budget: event.target.checked })
                    }
                  />
                  In budget
                </label>
              </div>
            </div>

            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted"
              >
                R
              </span>
              <input
                className="field field-money !pl-7"
                inputMode="decimal"
                aria-label={`Amount for ${row.name || "this line"}`}
                placeholder="0.00"
                value={row.amount}
                onChange={(event) => update(row.key, { amount: event.target.value })}
              />
            </div>

            <button
              type="button"
              className="btn !min-h-11 !w-10 !p-0"
              aria-label={`Remove ${row.name || "this line"}`}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn !min-h-9 !px-3 !py-1.5 !text-sm"
        onClick={() =>
          setRows((current) => [
            ...current,
            {
              key: crypto.randomUUID(),
              name: "",
              amount: "",
              category: "Subscriptions",
              include_in_budget: true,
            },
          ])
        }
      >
        Add a line
      </button>

      <SaveBar status={status} error={error} onSave={save} label="Save fixed expenses">
        <span className="text-xs text-ink-muted">
          Removing a line here only affects this month.
        </span>
      </SaveBar>
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
