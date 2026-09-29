import { redirect } from "next/navigation";

import { BudgetsForm } from "@/components/BudgetsForm";
import { ExportMenu } from "@/components/ExportMenu";
import { FixedExpensesForm } from "@/components/FixedExpensesForm";
import { MonthSummaryForm } from "@/components/MonthSummaryForm";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { analyseMonth } from "@/lib/aggregate";
import { getMonthSnapshot, listMonthKeys } from "@/lib/data";
import { formatMonthLong, normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plan - Budget" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const monthKey = normaliseMonthKey(m);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [snapshot, knownMonths] = await Promise.all([
    getMonthSnapshot(supabase, user.id, monthKey),
    listMonthKeys(supabase, user.id),
  ]);

  const { categories, totals } = analyseMonth(snapshot);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher monthKey={monthKey} knownMonths={knownMonths} />
        <ExportMenu monthKey={monthKey} />
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Plan for {formatMonthLong(monthKey)}
        </h1>
        <p className="text-sm text-ink-secondary">
          Income, the fixed commitments, and what each category is allowed to spend.
          A new month starts as a copy of the previous one.
        </p>
      </header>

      <MonthSummaryForm monthKey={monthKey} month={snapshot.month} />

      <BudgetsForm
        monthKey={monthKey}
        budgets={snapshot.budgets}
        categories={categories}
        salaryAfterTax={totals.salaryAfterTax}
        committedTotal={totals.committedTotal}
      />

      <FixedExpensesForm monthKey={monthKey} items={snapshot.fixedExpenses} />
    </div>
  );
}
