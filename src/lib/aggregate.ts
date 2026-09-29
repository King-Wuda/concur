import { CATEGORIES, type Category } from "@/lib/categories";
import { percentOf, round2, sum } from "@/lib/money";
import type { MonthSnapshot } from "@/lib/types";

/**
 * All of the month's arithmetic lives here, so the dashboard, the export and
 * any future view agree on what "spent" and "saved" mean.
 */

export type CategoryTotal = {
  category: Category;
  budgeted: number;
  actual: number;
  /** budgeted - actual. Negative means over budget. */
  variance: number;
  isOver: boolean;
  /** Share of total category spend, as a percentage. */
  share: number;
  /** actual / budgeted as a percentage; 0 when nothing is budgeted. */
  usedPercent: number;
  receiptCount: number;
};

export type MonthTotals = {
  salary: number;
  salaryAfterTax: number;
  tithe: number;
  /** 10% of salary - what the tithe would be if it tracked salary exactly. */
  titheExpected: number;
  rent: number;
  investec: number;

  /** Sum of every fixed expense row, whether or not it counts toward a budget. */
  fixedTotal: number;
  /** Fixed expenses deliberately excluded from category actuals. */
  fixedExcludedTotal: number;
  /** Sum of receipt totals. */
  receiptsTotal: number;
  /** Everything that lands in a category: receipts plus budget-counting fixed expenses. */
  categoryActualTotal: number;
  /** Tithe + rent + Investec: the summary block's committed outflows. */
  committedTotal: number;
  /** Every rand out the door this month. */
  totalSpend: number;

  /** Sum of the per-category budgets. */
  budgetTotal: number;
  /** What the plan expected to spend in total. */
  plannedSpend: number;

  /** Salary after tax minus everything actually spent. */
  remaining: number;
  /** Salary after tax minus everything the plan expected to spend. */
  plannedRemaining: number;
  /** How far ahead of (positive) or behind (negative) plan the month is. */
  savingsVsPlan: number;

  receiptCount: number;
  overspentCategories: Category[];
  totalOverspend: number;
  /** True once the salary-after-tax figure has been entered. */
  hasIncome: boolean;
};

export type MonthAnalysis = {
  monthKey: string;
  categories: CategoryTotal[];
  totals: MonthTotals;
};

function emptyCategoryMap(): Record<Category, number> {
  return CATEGORIES.reduce(
    (acc, category) => ({ ...acc, [category]: 0 }),
    {} as Record<Category, number>,
  );
}

export function analyseMonth(snapshot: MonthSnapshot): MonthAnalysis {
  const { month, budgets, receipts, fixedExpenses } = snapshot;

  const actualByCategory = emptyCategoryMap();
  const budgetByCategory = emptyCategoryMap();
  const receiptCountByCategory = emptyCategoryMap();

  for (const budget of budgets) {
    budgetByCategory[budget.category] = round2(Number(budget.budgeted_amount) || 0);
  }

  for (const receipt of receipts) {
    const items = receipt.line_items ?? [];
    for (const item of items) {
      actualByCategory[item.category] += Number(item.amount) || 0;
    }

    // A till slip's line items rarely add up to the printed total (VAT lines,
    // rounding, an unreadable row). Whatever is left over is attributed to the
    // receipt's own category so category totals still reconcile with receipt
    // totals to the cent.
    const itemsTotal = sum(items.map((item) => Number(item.amount) || 0));
    const residual = round2((Number(receipt.total) || 0) - itemsTotal);
    if (residual !== 0) {
      actualByCategory[receipt.category] += residual;
    }

    receiptCountByCategory[receipt.category] += 1;
  }

  let fixedTotal = 0;
  let fixedExcludedTotal = 0;
  for (const fixed of fixedExpenses) {
    const amount = Number(fixed.amount) || 0;
    fixedTotal += amount;
    if (fixed.include_in_budget) {
      actualByCategory[fixed.category] += amount;
    } else {
      fixedExcludedTotal += amount;
    }
  }

  const categoryActualTotal = sum(CATEGORIES.map((c) => actualByCategory[c]));

  const categories: CategoryTotal[] = CATEGORIES.map((category) => {
    const actual = round2(actualByCategory[category]);
    const budgeted = round2(budgetByCategory[category]);
    const variance = round2(budgeted - actual);
    return {
      category,
      budgeted,
      actual,
      variance,
      // Spending in a category budgeted at zero counts as over by the full
      // amount - that is the honest reading, and it surfaces forgotten budgets.
      isOver: actual > budgeted,
      share: percentOf(actual, categoryActualTotal),
      usedPercent: budgeted > 0 ? percentOf(actual, budgeted) : 0,
      receiptCount: receiptCountByCategory[category],
    };
  });

  const salary = round2(Number(month.salary) || 0);
  const salaryAfterTax = round2(Number(month.salary_after_tax) || 0);
  const tithe = round2(Number(month.tithe) || 0);
  const rent = round2(Number(month.rent) || 0);
  const investec = round2(Number(month.investec) || 0);

  const committedTotal = round2(tithe + rent + investec);
  const receiptsTotal = sum(receipts.map((r) => Number(r.total) || 0));
  const budgetTotal = sum(CATEGORIES.map((c) => budgetByCategory[c]));

  const totalSpend = round2(committedTotal + categoryActualTotal + fixedExcludedTotal);
  const plannedSpend = round2(committedTotal + budgetTotal + fixedExcludedTotal);

  const overspent = categories.filter((c) => c.isOver);

  return {
    monthKey: snapshot.monthKey,
    categories,
    totals: {
      salary,
      salaryAfterTax,
      tithe,
      titheExpected: round2(salary * 0.1),
      rent,
      investec,
      fixedTotal: round2(fixedTotal),
      fixedExcludedTotal: round2(fixedExcludedTotal),
      receiptsTotal,
      categoryActualTotal,
      committedTotal,
      totalSpend,
      budgetTotal,
      plannedSpend,
      remaining: round2(salaryAfterTax - totalSpend),
      plannedRemaining: round2(salaryAfterTax - plannedSpend),
      savingsVsPlan: round2(budgetTotal - categoryActualTotal),
      receiptCount: receipts.length,
      overspentCategories: overspent.map((c) => c.category),
      totalOverspend: sum(overspent.map((c) => Math.abs(c.variance))),
      hasIncome: salaryAfterTax > 0,
    },
  };
}
