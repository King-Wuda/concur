import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIES, categoryList, type Category, type CategoryInfo } from "@/lib/categories";
import { isMonthKey, monthKeyToDate, type MonthKey } from "@/lib/month";
import { budgetMonthFor, periodFor, todayInSouthAfrica, type MonthStart } from "@/lib/period";
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

  // Your own categories' budgets carry over like the built-in ones; a trip's
  // does not, because a trip happens once.
  const ownCategories = (await listCustomCategories(supabase, userId))
    .filter((c) => !c.event_id)
    .map((c) => c.name);

  await supabase.from("budgets").upsert(
    [...CATEGORIES, ...ownCategories].map((category) => ({
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

  const [starts, custom, transfers] = await Promise.all([
    listMonths(supabase, userId),
    listCustomCategories(supabase, userId),
    listMonthTransfers(supabase, userId, month.id),
  ]);
  const categories = categoryList(custom);

  return {
    monthKey,
    month,
    period: periodFor(monthKey, starts),
    categories,
    transfers,
    budgets: sortBudgets(budgets, categories),
    receipts,
    fixedExpenses: (fixedResult.data ?? []) as FixedExpenseRow[],
    income: (incomeResult.data ?? []) as IncomeRow[],
  };
}

function sortBudgets(budgets: BudgetRow[], categories: CategoryInfo[]): BudgetRow[] {
  const order = new Map(categories.map((c, i) => [c.name, i]));
  return [...budgets].sort(
    (a, b) => (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999),
  );
}

/**
 * Every month the user has data for, newest first, with its payday if it moved.
 * Works before migration 0004 has been run too: without the column every month
 * simply has the usual payday.
 */
export async function listMonths(supabase: DB, userId: string): Promise<MonthStart[]> {
  const withPayday = await supabase
    .from("months")
    .select("month, period_start")
    .eq("user_id", userId)
    .order("month", { ascending: false });

  let rows = withPayday.data as { month: string; period_start?: string | null }[] | null;
  if (withPayday.error) {
    if (withPayday.error.code !== "42703") throw withPayday.error; // undefined_column
    const plain = await supabase
      .from("months")
      .select("month")
      .eq("user_id", userId)
      .order("month", { ascending: false });
    if (plain.error) throw plain.error;
    rows = plain.data as { month: string }[];
  }

  return (rows ?? []).map((row) => ({
    month: row.month.slice(0, 7),
    periodStart: row.period_start ?? null,
  }));
}

/** The budget month a receipt or payment dated `date` is filed under. */
export async function budgetMonthOf(
  supabase: DB,
  userId: string,
  date: string,
): Promise<MonthKey> {
  return budgetMonthFor(date, await listMonths(supabase, userId));
}

/**
 * Which budget month a page shows: the one in the URL, or else the pay period
 * running today - so on 25 September the app opens on October.
 */
export async function resolveMonth(
  supabase: DB,
  userId: string,
  requested: string | undefined | null,
): Promise<{ monthKey: MonthKey; currentKey: MonthKey; months: MonthStart[] }> {
  const months = await listMonths(supabase, userId);
  const currentKey = budgetMonthFor(todayInSouthAfrica(), months);
  return { monthKey: isMonthKey(requested) ? requested : currentKey, currentKey, months };
}

export type CustomCategoryRow = {
  id: string;
  name: string;
  event_id: string | null;
  /** For a trip's category: when the trip ends, so finished trips can step aside. */
  event_end: string | null;
};

/**
 * Your own categories and your trips', oldest first. Empty before migration
 * 0009, when there are only the built-in six.
 */
export async function listCustomCategories(
  supabase: DB,
  userId: string,
): Promise<CustomCategoryRow[]> {
  const { data, error } = await supabase
    .from("budget_categories")
    .select("id, name, event_id, position, created_at, events (end_date)")
    .eq("user_id", userId)
    .order("position")
    .order("created_at");
  if (error) {
    if (["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "")) return [];
    throw error;
  }
  type Raw = { id: string; name: string; event_id: string | null; events: { end_date: string | null } | null };
  return ((data ?? []) as unknown as Raw[]).map((row) => ({
    id: row.id,
    name: row.name,
    event_id: row.event_id,
    event_end: row.events?.end_date ?? null,
  }));
}

/**
 * Trip money you sent or received in this budget month, each under its
 * trip's category. Empty before migration 0009.
 */
export async function listMonthTransfers(
  supabase: DB,
  userId: string,
  monthId: string,
): Promise<NonNullable<MonthSnapshot["transfers"]>> {
  const { data, error } = await supabase
    .from("event_transfers")
    .select(
      "amount, from:event_participants!event_transfers_from_participant_fkey (is_me)," +
        " events (budget_categories (name))",
    )
    .eq("user_id", userId)
    .eq("month_id", monthId);
  if (error) {
    if (["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "")) return [];
    throw error;
  }
  type Raw = {
    amount: number;
    from: { is_me: boolean } | null;
    events: { budget_categories: { name: string }[] } | null;
  };
  return ((data ?? []) as unknown as Raw[])
    .map((row) => ({
      amount: Number(row.amount) || 0,
      category: row.events?.budget_categories?.[0]?.name ?? "Miscellaneous",
      direction: (row.from?.is_me ? "out" : "in") as "in" | "out",
    }));
}
