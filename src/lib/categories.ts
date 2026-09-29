/**
 * The fixed category set. This list is closed on purpose: it mirrors the
 * `public.is_category()` check constraint in supabase/migrations/0001_init.sql,
 * so adding a category means changing both places.
 */
export const CATEGORIES = [
  "Groceries",
  "Transport",
  "Chill",
  "Subscriptions",
  "Lily",
  "Miscellaneous",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DEFAULT_CATEGORY: Category = "Miscellaneous";

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Coerces anything (including a model's best guess) into a valid category. */
export function toCategory(value: unknown): Category {
  if (isCategory(value)) return value;
  if (typeof value === "string") {
    const match = CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
    if (match) return match;
  }
  return DEFAULT_CATEGORY;
}

/** Short hints shown next to each category in the UI. */
export const CATEGORY_HINTS: Record<Category, string> = {
  Groceries: "Supermarkets and household food shopping",
  Transport: "Ride-hailing, fuel, taxis, public transport",
  Chill: "Restaurants, takeaways, entertainment",
  Subscriptions: "Recurring monthly services",
  Lily: "Anything for Lily",
  Miscellaneous: "Everything that fits nowhere else",
};

/**
 * Categorical colour slots from the validated data-viz palette, in fixed
 * order. Index 0..5 maps to Groceries..Miscellaneous and never gets cycled or
 * reassigned, so a category keeps its colour across every chart and filter.
 */
export const CATEGORY_COLOR_VAR: Record<Category, string> = {
  Groceries: "var(--series-1)",
  Transport: "var(--series-2)",
  Chill: "var(--series-3)",
  Subscriptions: "var(--series-4)",
  Lily: "var(--series-5)",
  Miscellaneous: "var(--series-6)",
};
