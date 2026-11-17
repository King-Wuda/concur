import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Moving money from one category name to another everywhere it is used -
 * receipts, their lines, budgets and fixed expenses - for a rename, or to send
 * a removed category's money to Miscellaneous. The database checks each row's
 * new category exists, so the target must exist before this runs.
 */
export async function moveCategoryRows(
  supabase: SupabaseClient,
  userId: string,
  from: string,
  to: string,
  options: { dropBudgets?: boolean } = {},
) {
  for (const table of ["receipts", "line_items", "fixed_expenses"] as const) {
    const { error } = await supabase
      .from(table)
      .update({ category: to })
      .eq("user_id", userId)
      .eq("category", from);
    if (error) throw error;
  }
  if (options.dropBudgets) {
    const { error } = await supabase
      .from("budgets")
      .delete()
      .eq("user_id", userId)
      .eq("category", from);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("budgets")
      .update({ category: to })
      .eq("user_id", userId)
      .eq("category", from);
    if (error) throw error;
  }
}

/**
 * Creates a category named `wanted`, or `wanted (2)` and so on when that name
 * is taken (by one of the built-in six or one of your own). Returns the name
 * it got.
 */
export async function createCategory(
  supabase: SupabaseClient,
  userId: string,
  wanted: string,
  eventId: string | null,
): Promise<string> {
  const base = wanted.trim().slice(0, 34);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const name = attempt === 1 ? base : `${base} (${attempt})`;
    const { error } = await supabase
      .from("budget_categories")
      .insert({ user_id: userId, name, event_id: eventId });
    if (!error) return name;
    // 23505: that name is yours already; 23514: it is a built-in one.
    if (error.code !== "23505" && error.code !== "23514") throw error;
  }
  throw new Error("Could not find a free name for that category.");
}
