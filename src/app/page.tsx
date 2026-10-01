import Link from "next/link";
import { redirect } from "next/navigation";

import { BudgetMeters } from "@/components/BudgetMeters";
import { ExportMenu } from "@/components/ExportMenu";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { StatTile } from "@/components/StatTile";
import { SpendPieChart } from "@/components/charts/SpendPieChart";
import { analyseMonth } from "@/lib/aggregate";
import { getMonthSnapshot, listMonthKeys } from "@/lib/data";
import { formatRand, formatRandSigned } from "@/lib/money";
import { formatMonthLong, normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard - Budget" };

export default async function DashboardPage({
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
  const monthHref = (path: string) => `${path}?m=${monthKey}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">Dashboard for {formatMonthLong(monthKey)}</h1>
        <MonthSwitcher monthKey={monthKey} knownMonths={knownMonths} />
        <ExportMenu monthKey={monthKey} />
      </div>

      {/* The one number the month is about. */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <StatTile
            label={totals.remaining < 0 ? "Overspent" : "Left to save"}
            value={Math.abs(totals.remaining)}
            size="hero"
            tone={totals.remaining < 0 ? "critical" : "good"}
            detail={
              totals.hasIncome
                ? `${formatRandSigned(totals.savingsVsPlan)} against plan`
                : "Add your salary on the Plan tab"
            }
          />
        </div>
        <StatTile
          label="Money in"
          value={totals.availableTotal}
          detail={
            totals.incomeTotal > 0
              ? `${formatRand(totals.salaryAfterTax)} salary + ${formatRand(
                  totals.incomeTotal,
                )} from ${totals.incomeCount} other source${
                  totals.incomeCount === 1 ? "" : "s"
                }`
              : totals.salary > 0
                ? `${formatRand(totals.salary)} salary before tax`
                : "Not set yet"
          }
        />
        <StatTile
          label="Total spend"
          value={totals.totalSpend}
          detail={`${formatRand(totals.receiptsTotal)} across ${totals.receiptCount} receipt${
            totals.receiptCount === 1 ? "" : "s"
          }`}
        />
      </section>

      {totals.overspentCategories.length > 0 && (
        <section
          className="card flex flex-wrap items-center gap-x-3 gap-y-1 p-4"
          style={{ borderColor: "var(--critical)" }}
          role="status"
        >
          <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--critical)" }}>
            <WarningIcon />
            Over budget
          </span>
          <span className="text-sm text-ink-secondary">
            {totals.overspentCategories.join(", ")} — {formatRand(totals.totalOverspend)} over
            in total.
          </span>
        </section>
      )}

      <section className="card p-4 sm:p-5">
        <header className="mb-3">
          <h2 className="font-semibold">Where the money went</h2>
          <p className="text-sm text-ink-secondary">
            Share of {formatRand(totals.positiveSpendTotal)} in categorised spend
            {totals.positiveSpendTotal !== totals.categoryActualTotal &&
              `, before ${formatRand(
                totals.positiveSpendTotal - totals.categoryActualTotal,
              )} came back`}
            .
          </p>
        </header>
        <SpendPieChart categories={categories} />
      </section>

      <section className="card p-4 sm:p-5">
        <header className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-semibold">Budget vs actual</h2>
            <p className="text-sm text-ink-secondary">
              {formatRand(totals.categoryActualTotal)} spent of{" "}
              {formatRand(totals.budgetTotal)} budgeted.
            </p>
          </div>
          <Link
            href={monthHref("/plan")}
            className="shrink-0 text-sm font-medium text-accent underline underline-offset-4"
          >
            Edit budgets
          </Link>
        </header>
        <BudgetMeters categories={categories} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Monthly summary</h2>
          <dl className="space-y-2 text-sm">
            <SummaryRow label="Salary" value={totals.salary} />
            <SummaryRow label="Salary after tax" value={totals.salaryAfterTax} />
            {totals.incomeTotal !== 0 && (
              <SummaryRow
                label="Other money in"
                value={totals.incomeTotal}
                detail={`${totals.incomeCount} entr${
                  totals.incomeCount === 1 ? "y" : "ies"
                }`}
                tone="good"
              />
            )}
            <SummaryRow
              label="Tithe"
              value={totals.tithe}
              detail={
                totals.salary > 0 && Math.abs(totals.tithe - totals.titheExpected) >= 1
                  ? `10% would be ${formatRand(totals.titheExpected)}`
                  : "10% of salary"
              }
            />
            <SummaryRow label="Rent" value={totals.rent} />
            <SummaryRow label="Investec" value={totals.investec} />
            <SummaryRow label="Subscriptions & fixed" value={totals.fixedTotal} />
            <div className="border-t border-line pt-2">
              <SummaryRow label="Total spend" value={totals.totalSpend} strong />
              <SummaryRow
                label={totals.remaining < 0 ? "Shortfall" : "Left / saved"}
                value={totals.remaining}
                strong
                tone={totals.remaining < 0 ? "critical" : "good"}
              />
            </div>
          </dl>
        </div>

        <div className="card p-4 sm:p-5">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">Latest receipts</h2>
            <Link
              href={monthHref("/receipts")}
              className="text-sm font-medium text-accent underline underline-offset-4"
            >
              See all
            </Link>
          </header>

          {snapshot.receipts.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-ink-secondary">
                Nothing logged for {formatMonthLong(monthKey)} yet.
              </p>
              <Link href={monthHref("/capture")} className="btn btn-primary">
                Scan a receipt
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)] text-sm">
              {snapshot.receipts.slice(0, 6).map((receipt) => (
                <li key={receipt.id} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{receipt.store_name}</span>
                    <span className="text-xs text-ink-muted">
                      {receipt.date} · {receipt.category} ·{" "}
                      {receipt.line_items.length} item
                      {receipt.line_items.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="tabular font-medium">{formatRand(receipt.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  detail,
  strong,
  tone,
}: {
  label: string;
  value: number;
  detail?: string;
  strong?: boolean;
  tone?: "good" | "critical";
}) {
  const color =
    tone === "good" ? "var(--good-ink)" : tone === "critical" ? "var(--critical)" : undefined;

  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold" : undefined}>
        {label}
        {detail && <span className="block text-xs text-ink-muted">{detail}</span>}
      </dt>
      <dd
        className={`tabular ${strong ? "font-semibold" : ""}`}
        style={color ? { color } : undefined}
      >
        {tone === "critical" ? formatRand(Math.abs(value)) : formatRand(value)}
      </dd>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 4.5 2.8 20h18.4Z" />
      <path d="M12 10.5v4M12 17.4v.2" />
    </svg>
  );
}
