import { redirect } from "next/navigation";

import { BudgetsForm } from "@/components/BudgetsForm";
import { ExportMenu } from "@/components/ExportMenu";
import { FixedExpensesForm } from "@/components/FixedExpensesForm";
import { MonthSummaryForm } from "@/components/MonthSummaryForm";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { PaydayForm } from "@/components/PaydayForm";
import { analyseMonth } from "@/lib/aggregate";
import { getMonthSnapshot, resolveMonth } from "@/lib/data";
import { formatMonthLong, shiftMonth } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Plan - Budget" };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { monthKey, currentKey, months } = await resolveMonth(supabase, user.id, m);
  const snapshot = await getMonthSnapshot(supabase, user.id, monthKey);
  const knownMonths = months.map((row) => row.month);

  const { categories, totals } = analyseMonth(snapshot);

  // How last month ended, so its overspend can be carried in as a deficit.
  // Only read if it exists: opening it would otherwise create an empty month.
  const previousKey = shiftMonth(monthKey, -1);
  const previousMonth = months.some((row) => row.month === previousKey)
    ? {
        name: formatMonthLong(previousKey),
        shortfall: Math.max(
          -analyseMonth(await getMonthSnapshot(supabase, user.id, previousKey)).totals.remaining,
          0,
        ),
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher monthKey={monthKey} currentKey={currentKey} knownMonths={knownMonths} />
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

      <PaydayForm key={`${monthKey}-${snapshot.period?.start}`} monthKey={monthKey} starts={months} />

      <MonthSummaryForm monthKey={monthKey} month={snapshot.month} />

      <BudgetsForm
        monthKey={monthKey}
        budgets={snapshot.budgets}
        categories={categories}
        salaryAfterTax={totals.salaryAfterTax}
        committedTotal={totals.committedTotal}
        deficit={totals.deficit}
        previousMonth={previousMonth}
      />

      <FixedExpensesForm monthKey={monthKey} items={snapshot.fixedExpenses} />
    </div>
  );
}
