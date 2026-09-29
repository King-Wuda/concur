"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveBudgets } from "@/app/actions";
import { MoneyField } from "@/components/MoneyField";
import { SaveBar } from "@/components/SaveBar";
import type { CategoryTotal } from "@/lib/aggregate";
import { CATEGORIES, CATEGORY_HINTS, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import type { MonthKey } from "@/lib/month";
import type { BudgetRow } from "@/lib/types";

/**
 * Per-category budgets, with a running readout of what is left to allocate
 * after the fixed commitments - so the plan can be checked against income while
 * it is being typed rather than after saving.
 */
export function BudgetsForm({
  monthKey,
  budgets,
  categories,
  salaryAfterTax,
  committedTotal,
}: {
  monthKey: MonthKey;
  budgets: BudgetRow[];
  categories: CategoryTotal[];
  salaryAfterTax: number;
  committedTotal: number;
}) {
  const router = useRouter();

  const [amounts, setAmounts] = useState<Record<Category, string>>(() => {
    const byCategory = new Map(budgets.map((b) => [b.category, Number(b.budgeted_amount) || 0]));
    return CATEGORIES.reduce(
      (acc, category) => {
        const value = byCategory.get(category) ?? 0;
        return { ...acc, [category]: value === 0 ? "" : String(round2(value)) };
      },
      {} as Record<Category, string>,
    );
  });

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const actualByCategory = new Map(categories.map((c) => [c.category, c.actual]));
  const budgetTotal = sum(CATEGORIES.map((category) => parseRand(amounts[category])));
  const unallocated = round2(salaryAfterTax - committedTotal - budgetTotal);

  async function save() {
    setStatus("saving");
    setError(null);

    const result = await saveBudgets({
      monthKey,
      budgets: CATEGORIES.map((category) => ({
        category,
        budgeted_amount: parseRand(amounts[category]),
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
      <header>
        <h2 className="font-semibold">Category budgets</h2>
        <p className="text-sm text-ink-secondary">
          What each category is allowed this month. Spend already logged is shown
          beside each one.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {CATEGORIES.map((category) => {
          const actual = actualByCategory.get(category) ?? 0;
          const budgeted = parseRand(amounts[category]);
          return (
            <MoneyField
              key={category}
              id={`budget-${category.toLowerCase()}`}
              label={category}
              value={amounts[category]}
              onChange={(value) => setAmounts((current) => ({ ...current, [category]: value }))}
              hint={
                actual > 0
                  ? `${formatRand(actual)} spent${
                      budgeted > 0 && actual > budgeted
                        ? ` — ${formatRand(actual - budgeted)} over`
                        : ""
                    }`
                  : CATEGORY_HINTS[category]
              }
              action={
                actual > 0 && Math.abs(actual - budgeted) >= 0.01
                  ? {
                      label: "Match actual",
                      onClick: () =>
                        setAmounts((current) => ({
                          ...current,
                          [category]: String(round2(actual)),
                        })),
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      <dl className="space-y-1.5 rounded-lg bg-sunken p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt>Budgeted across categories</dt>
          <dd className="tabular font-medium">{formatRand(budgetTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Fixed commitments (tithe, rent, Investec)</dt>
          <dd className="tabular">{formatRand(committedTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-line pt-1.5">
          <dt className="font-semibold">
            {unallocated < 0 ? "Over-allocated" : "Left to save if the plan holds"}
          </dt>
          <dd
            className="tabular font-semibold"
            style={{ color: unallocated < 0 ? "var(--critical)" : "var(--good-ink)" }}
          >
            {formatRand(Math.abs(unallocated))}
          </dd>
        </div>
        {salaryAfterTax === 0 && (
          <p className="text-xs text-ink-muted">
            Add your salary after tax above to see what is left over.
          </p>
        )}
      </dl>

      <SaveBar status={status} error={error} onSave={save} label="Save budgets" />
    </section>
  );
}
