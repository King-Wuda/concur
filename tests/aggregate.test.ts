import assert from "node:assert/strict";
import { test } from "node:test";

import { analyseMonth } from "@/lib/aggregate";
import type { Category } from "@/lib/categories";
import type {
  BudgetRow,
  FixedExpenseRow,
  IncomeRow,
  LineItemRow,
  MonthSnapshot,
  ReceiptWithItems,
} from "@/lib/types";

/* Builders, so each test only states what it cares about. */

function month(overrides: Partial<MonthSnapshot["month"]> = {}) {
  return {
    id: "month-1",
    user_id: "user-1",
    month: "2026-09-01",
    salary: 0,
    salary_after_tax: 0,
    tithe: 0,
    rent: 0,
    investec: 0,
    notes: null,
    ...overrides,
  };
}

function budget(category: Category, amount: number): BudgetRow {
  return {
    id: `budget-${category}`,
    month_id: "month-1",
    category,
    budgeted_amount: amount,
  };
}

let itemCounter = 0;
function item(name: string, amount: number, category: Category): LineItemRow {
  itemCounter += 1;
  return {
    id: `item-${itemCounter}`,
    receipt_id: "receipt",
    item_name: name,
    amount,
    quantity: null,
    category,
    position: itemCounter,
  };
}

function receipt(
  id: string,
  total: number,
  category: Category,
  lineItems: LineItemRow[] = [],
): ReceiptWithItems {
  return {
    id,
    month_id: "month-1",
    store_name: `Store ${id}`,
    date: "2026-09-10",
    total,
    category,
    image_path: null,
    note: null,
    created_at: "2026-09-10T10:00:00Z",
    line_items: lineItems,
  };
}

function fixed(
  name: string,
  amount: number,
  category: Category = "Subscriptions",
  includeInBudget = true,
): FixedExpenseRow {
  return {
    id: `fixed-${name}`,
    month_id: "month-1",
    name,
    amount,
    category,
    include_in_budget: includeInBudget,
    position: 0,
  };
}

function income(source: string, amount: number, date = "2026-09-05"): IncomeRow {
  return {
    id: `income-${source}`,
    month_id: "month-1",
    source,
    date,
    amount,
    note: null,
    created_at: "2026-09-05T10:00:00Z",
  };
}

function snapshot(parts: Partial<MonthSnapshot> = {}): MonthSnapshot {
  return {
    monthKey: "2026-09",
    month: month(),
    budgets: [],
    receipts: [],
    fixedExpenses: [],
    income: [],
    ...parts,
  };
}

function actualFor(
  analysis: ReturnType<typeof analyseMonth>,
  category: Category,
): number {
  return analysis.categories.find((c) => c.category === category)!.actual;
}

/* -------------------------------------------------------------------------- */

test("an empty month reports zeroes rather than blowing up", () => {
  const { totals, categories } = analyseMonth(snapshot());

  assert.equal(totals.totalSpend, 0);
  assert.equal(totals.remaining, 0);
  assert.equal(totals.hasIncome, false);
  assert.equal(categories.length, 6);
  assert.deepEqual(totals.overspentCategories, []);
});

test("line items drive category actuals", () => {
  const analysis = analyseMonth(
    snapshot({
      receipts: [
        receipt("r1", 350, "Groceries", [
          item("Milk", 30, "Groceries"),
          item("Bread", 20, "Groceries"),
          item("Nappies", 300, "Lily"),
        ]),
      ],
    }),
  );

  assert.equal(actualFor(analysis, "Groceries"), 50);
  assert.equal(actualFor(analysis, "Lily"), 300);
  assert.equal(analysis.totals.receiptsTotal, 350);
});

test("a shortfall between line items and the printed total lands on the receipt's category", () => {
  // The slip says R100 but only R90 of items could be read; the missing R10
  // still has to show up somewhere or the month stops reconciling.
  const analysis = analyseMonth(
    snapshot({
      receipts: [receipt("r1", 100, "Groceries", [item("Rice", 90, "Groceries")])],
    }),
  );

  assert.equal(actualFor(analysis, "Groceries"), 100);
  assert.equal(analysis.totals.categoryActualTotal, 100);
});

test("category totals always reconcile with receipt totals plus fixed expenses", () => {
  const analysis = analyseMonth(
    snapshot({
      receipts: [
        receipt("r1", 100, "Groceries", [item("Rice", 90, "Groceries")]),
        // Line items over-summing the total is equally possible.
        receipt("r2", 80, "Chill", [
          item("Burger", 60, "Chill"),
          item("Shake", 35, "Chill"),
        ]),
        receipt("r3", 240, "Transport"),
      ],
      fixedExpenses: [fixed("Spotify", 69), fixed("Gym", 500)],
    }),
  );

  assert.equal(analysis.totals.receiptsTotal, 420);
  assert.equal(analysis.totals.categoryActualTotal, 420 + 569);
  assert.equal(actualFor(analysis, "Chill"), 80);
  assert.equal(actualFor(analysis, "Subscriptions"), 569);
});

test("a fixed expense excluded from budgets is still spend, but not a category actual", () => {
  const analysis = analyseMonth(
    snapshot({
      month: month({ salary_after_tax: 1000 }),
      fixedExpenses: [fixed("Already in rent", 400, "Miscellaneous", false)],
    }),
  );

  assert.equal(actualFor(analysis, "Miscellaneous"), 0);
  assert.equal(analysis.totals.fixedTotal, 400);
  assert.equal(analysis.totals.fixedExcludedTotal, 400);
  assert.equal(analysis.totals.totalSpend, 400);
  assert.equal(analysis.totals.remaining, 600);
});

test("overspend is detected per category, including where nothing was budgeted", () => {
  const analysis = analyseMonth(
    snapshot({
      budgets: [budget("Groceries", 3000), budget("Chill", 1000)],
      receipts: [
        receipt("r1", 3200, "Groceries", [item("Shop", 3200, "Groceries")]),
        receipt("r2", 900, "Chill", [item("Dinner", 900, "Chill")]),
        receipt("r3", 150, "Lily", [item("Toy", 150, "Lily")]),
      ],
    }),
  );

  assert.deepEqual(analysis.totals.overspentCategories, ["Groceries", "Lily"]);
  assert.equal(analysis.totals.totalOverspend, 200 + 150);

  const groceries = analysis.categories.find((c) => c.category === "Groceries")!;
  assert.equal(groceries.variance, -200);
  assert.equal(groceries.usedPercent, 106.67);

  const chill = analysis.categories.find((c) => c.category === "Chill")!;
  assert.equal(chill.isOver, false);
  assert.equal(chill.variance, 100);
});

test("savings are salary after tax less every outflow", () => {
  const analysis = analyseMonth(
    snapshot({
      month: month({
        salary: 50_000,
        salary_after_tax: 38_000,
        tithe: 5_000,
        rent: 12_000,
        investec: 4_000,
      }),
      budgets: [budget("Groceries", 4_000), budget("Chill", 2_000)],
      receipts: [
        receipt("r1", 3_500, "Groceries", [item("Shop", 3_500, "Groceries")]),
        receipt("r2", 1_200, "Chill", [item("Dinner", 1_200, "Chill")]),
      ],
      fixedExpenses: [fixed("Spotify", 69), fixed("Gym", 500)],
    }),
  );

  const t = analysis.totals;
  assert.equal(t.committedTotal, 21_000);
  assert.equal(t.categoryActualTotal, 3_500 + 1_200 + 569);
  assert.equal(t.totalSpend, 21_000 + 5_269);
  assert.equal(t.remaining, 38_000 - 26_269);
  assert.equal(t.budgetTotal, 6_000);
  assert.equal(t.plannedSpend, 27_000);
  assert.equal(t.plannedRemaining, 11_000);
  // Ahead of plan by whatever is left of the category budgets.
  assert.equal(t.savingsVsPlan, 6_000 - 5_269);
  assert.equal(t.remaining - t.plannedRemaining, t.savingsVsPlan);
  assert.equal(t.titheExpected, 5_000);
  assert.equal(t.hasIncome, true);
});

test("shares are a percentage of categorised spend", () => {
  const analysis = analyseMonth(
    snapshot({
      receipts: [
        receipt("r1", 750, "Groceries", [item("Shop", 750, "Groceries")]),
        receipt("r2", 250, "Chill", [item("Dinner", 250, "Chill")]),
      ],
    }),
  );

  assert.equal(actualFor(analysis, "Groceries"), 750);
  assert.equal(analysis.categories.find((c) => c.category === "Groceries")!.share, 75);
  assert.equal(analysis.categories.find((c) => c.category === "Chill")!.share, 25);
});

test("a ride-share screenshot splits between Transport and Chill", () => {
  // The spec's rule: the KFC order inside a ride-hailing history is Chill even
  // though the receipt as a whole is filed under Transport.
  const analysis = analyseMonth(
    snapshot({
      receipts: [
        receipt("uber", 430, "Transport", [
          item("Trip to Sandton", 120, "Transport"),
          item("Trip home", 145, "Transport"),
          item("KFC Streetwise", 95, "Chill"),
          item("Pizza Perfect", 70, "Chill"),
        ]),
      ],
    }),
  );

  assert.equal(actualFor(analysis, "Transport"), 265);
  assert.equal(actualFor(analysis, "Chill"), 165);
  assert.equal(analysis.totals.categoryActualTotal, 430);
});

test("a discount line reduces the category it belongs to", () => {
  // Out of pocket after a gift card, not full retail.
  const analysis = analyseMonth(
    snapshot({
      receipts: [
        receipt("r1", 700, "Groceries", [
          item("Groceries", 1_000, "Groceries"),
          item("Gift card", -300, "Groceries"),
        ]),
      ],
    }),
  );

  assert.equal(actualFor(analysis, "Groceries"), 700);
  assert.equal(analysis.totals.receiptsTotal, 700);
});

test("money in raises what there is to spend, without touching any category", () => {
  const analysis = analyseMonth(
    snapshot({
      month: month({ salary: 50_000, salary_after_tax: 38_000 }),
      budgets: [budget("Groceries", 4_000)],
      receipts: [receipt("r1", 3_500, "Groceries", [item("Shop", 3_500, "Groceries")])],
      income: [income("Mum", 1_500), income("Takealot refund", 320)],
    }),
  );

  const t = analysis.totals;
  assert.equal(t.incomeTotal, 1_820);
  assert.equal(t.availableTotal, 39_820);
  assert.equal(t.incomeCount, 2);

  // Spending is untouched by it: the category still shows only what was spent.
  assert.equal(actualFor(analysis, "Groceries"), 3_500);
  assert.equal(t.categoryActualTotal, 3_500);
  assert.equal(t.totalSpend, 3_500);

  // What is left goes up by exactly what came in.
  assert.equal(t.remaining, 39_820 - 3_500);
  assert.equal(t.plannedRemaining, 39_820 - 4_000);

  // Being ahead of plan is about spending, so income does not flatter it.
  assert.equal(t.savingsVsPlan, 500);
});

test("income alone counts as knowing what came in", () => {
  const analysis = analyseMonth(snapshot({ income: [income("Side job", 900)] }));
  assert.equal(analysis.totals.hasIncome, true);
  assert.equal(analysis.totals.availableTotal, 900);
  assert.equal(analysis.totals.remaining, 900);
});

test("income does not appear in any category share", () => {
  const analysis = analyseMonth(
    snapshot({
      receipts: [receipt("r1", 250, "Chill", [item("Dinner", 250, "Chill")])],
      income: [income("Mum", 5_000)],
    }),
  );

  // The pie is a share of spend, so a big month of gifts must not shrink it.
  assert.equal(analysis.categories.find((c) => c.category === "Chill")!.share, 100);
  assert.equal(analysis.totals.categoryActualTotal, 250);
});

test("a month with more coming in than going out is not overspent", () => {
  const analysis = analyseMonth(
    snapshot({
      month: month({ salary_after_tax: 1_000 }),
      receipts: [receipt("r1", 1_400, "Groceries")],
      income: [income("Mum", 800)],
    }),
  );

  assert.equal(analysis.totals.availableTotal, 1_800);
  assert.equal(analysis.totals.remaining, 400);
});
