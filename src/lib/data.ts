import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIES, type Category } from "@/lib/categories";
import { monthKeyToDate, type MonthKey } from "@/lib/month";
import type {
  BudgetRow,
  FixedExpenseRow,
  IncomeRow,
  MonthRow,
  MonthSnapshot,
  ReceiptWithItems,
} from "@/lib/types";

/**
 * Database access for a month. Every query runs through the caller's
 * request-scoped Supabase client, so row level security applies; `user_id` is
 * still set explicitly on inserts because the insert policies check it.
 */

/** The subscription lines carried over from the original Excel workbook. */
export const DEFAULT_SUBSCRIPTIONS = [
  "Gym",
  "MMA",
  "Claude",
  "VPS",
  "iCloud",
  "Spotify",
] as const;

type DB = SupabaseClient;

/**
 * Returns the month row, creating it on first visit. A brand new month is
 * pre-filled from the most recent earlier month - salary, rent, Investec,
 * per-category budgets and subscription lines all carry over - because months
 * mostly repeat and retyping them is what made the spreadsheet tedious.
 */
export async function ensureMonth(
  supabase: DB,
  userId: string,
  monthKey: MonthKey,
): Promise<MonthRow> {
  const monthDate = monthKeyToDate(monthKey);

  const existing = await supabase
    .from("months")
    .select("*")
    .eq("user_id", userId)
    .eq("month", monthDate)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as MonthRow;

  const previous = await supabase
    .from("months")
    .select("*")
    .eq("user_id", userId)
    .lt("month", monthDate)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previous.error) throw previous.error;
  const prior = previous.data as MonthRow | null;

  const inserted = await supabase
    .from("months")
    .insert({
      user_id: userId,
      month: monthDate,
      salary: prior?.salary ?? 0,
      salary_after_tax: prior?.salary_after_tax ?? 0,
      tithe: prior?.tithe ?? 0,
      rent: prior?.rent ?? 0,
      investec: prior?.investec ?? 0,
    })
    .select("*")
    .single();

  if (inserted.error) {
    // Another request created it first; fall back to reading that row.
    const retry = await supabase
      .from("months")
      .select("*")
      .eq("user_id", userId)
      .eq("month", monthDate)
      .single();
    if (retry.error) throw inserted.error;
    return retry.data as MonthRow;
  }

  const month = inserted.data as MonthRow;
  await seedMonth(supabase, userId, month, prior);
  return month;
}

async function seedMonth(
  supabase: DB,
  userId: string,
  month: MonthRow,
  prior: MonthRow | null,
): Promise<void> {
  const priorBudgets = prior
    ? ((
        await supabase
          .from("budgets")
          .select("category, budgeted_amount")
          .eq("month_id", prior.id)
      ).data as Pick<BudgetRow, "category" | "budgeted_amount">[] | null)
    : null;

  const priorAmountFor = new Map(
    (priorBudgets ?? []).map((b) => [b.category, Number(b.budgeted_amount) || 0]),
  );

  await supabase.from("budgets").upsert(
    CATEGORIES.map((category) => ({
      user_id: userId,
      month_id: month.id,
      category,
      budgeted_amount: priorAmountFor.get(category) ?? 0,
    })),
    { onConflict: "month_id,category" },
  );

  const priorFixed = prior
    ? ((
        await supabase
          .from("fixed_expenses")
          .select("name, amount, category, include_in_budget, position")
          .eq("month_id", prior.id)
          .order("position")
      ).data as Omit<FixedExpenseRow, "id" | "month_id">[] | null)
    : null;

  const fixedRows =
    priorFixed && priorFixed.length > 0
      ? priorFixed.map((row, index) => ({
          user_id: userId,
          month_id: month.id,
          name: row.name,
          amount: Number(row.amount) || 0,
          category: row.category,
          include_in_budget: row.include_in_budget,
          position: index,
        }))
      : DEFAULT_SUBSCRIPTIONS.map((name, index) => ({
          user_id: userId,
          month_id: month.id,
          name,
          amount: 0,
          category: "Subscriptions" as Category,
          include_in_budget: true,
          position: index,
        }));

  await supabase
    .from("fixed_expenses")
    .upsert(fixedRows, { onConflict: "month_id,name" });
}

/** Makes sure all six budget rows exist, for months created before a change. */
async function ensureBudgetRows(
  supabase: DB,
  userId: string,
  monthId: string,
  budgets: BudgetRow[],
): Promise<BudgetRow[]> {
  const missing = CATEGORIES.filter((c) => !budgets.some((b) => b.category === c));
  if (missing.length === 0) return budgets;

  const inserted = await supabase
    .from("budgets")
    .upsert(
      missing.map((category) => ({
        user_id: userId,
        month_id: monthId,
        category,
        budgeted_amount: 0,
      })),
      { onConflict: "month_id,category" },
    )
    .select("id, month_id, category, budgeted_amount");

  if (inserted.error) throw inserted.error;
  return [...budgets, ...((inserted.data ?? []) as BudgetRow[])];
}

/** Everything one month's views need, in three round trips. */
export async function getMonthSnapshot(
  supabase: DB,
  userId: string,
  monthKey: MonthKey,
): Promise<MonthSnapshot> {
  const month = await ensureMonth(supabase, userId, monthKey);

  const [budgetsResult, receiptsResult, fixedResult, incomeResult] = await Promise.all([
    supabase
      .from("budgets")
      .select("id, month_id, category, budgeted_amount")
      .eq("month_id", month.id),
    supabase
      .from("receipts")
      .select(
        "id, month_id, store_name, date, total, category, image_path, note, created_at," +
          " line_items (id, receipt_id, item_name, amount, quantity, category, position)",
      )
      .eq("month_id", month.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("fixed_expenses")
      .select("id, month_id, name, amount, category, include_in_budget, position")
      .eq("month_id", month.id)
      .order("position"),
    supabase
      .from("income")
      .select("id, month_id, source, date, amount, note, created_at")
      .eq("month_id", month.id)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (budgetsResult.error) throw budgetsResult.error;
  if (receiptsResult.error) throw receiptsResult.error;
  if (fixedResult.error) throw fixedResult.error;
  if (incomeResult.error) throw incomeResult.error;

  const budgets = await ensureBudgetRows(
    supabase,
    userId,
    month.id,
    (budgetsResult.data ?? []) as BudgetRow[],
  );

  const receipts = ((receiptsResult.data ?? []) as unknown as ReceiptWithItems[]).map((receipt) => ({
    ...receipt,
    line_items: [...(receipt.line_items ?? [])].sort((a, b) => a.position - b.position),
  }));

  return {
    monthKey,
    month,
    budgets: sortBudgets(budgets),
    receipts,
    fixedExpenses: (fixedResult.data ?? []) as FixedExpenseRow[],
    income: (incomeResult.data ?? []) as IncomeRow[],
  };
}

function sortBudgets(budgets: BudgetRow[]): BudgetRow[] {
  const order = new Map(CATEGORIES.map((c, i) => [c, i]));
  return [...budgets].sort(
    (a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0),
  );
}

/** Every month the user has data for, newest first, as "YYYY-MM" keys. */
export async function listMonthKeys(supabase: DB, userId: string): Promise<MonthKey[]> {
  const { data, error } = await supabase
    .from("months")
    .select("month")
    .eq("user_id", userId)
    .order("month", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as { month: string }[]).map((row) => row.month.slice(0, 7));
}
