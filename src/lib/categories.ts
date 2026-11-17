/**
 * The six built-in categories. They mirror `public.is_category()` in
 * supabase/migrations/0001_init.sql. Alongside them each person can add their
 * own (budget_categories, migration 0009), and every trip gets one named after
 * it; the database accepts a built-in category or one of the owner's own.
 */
export const CATEGORIES = [
  "Groceries",
  "Transport",
  "Chill",
  "Subscriptions",
  "Lily",
  "Miscellaneous",
] as const;

export type BuiltInCategory = (typeof CATEGORIES)[number];

/** Any category name: built in, your own, or a trip's. */
export type Category = string;

export const DEFAULT_CATEGORY: BuiltInCategory = "Miscellaneous";

/** True for one of the six built-in categories. */
export function isCategory(value: unknown): value is BuiltInCategory {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

/** Coerces anything (including a model's best guess) into a built-in category. */
export function toCategory(value: unknown): BuiltInCategory {
  if (isCategory(value)) return value;
  if (typeof value === "string") {
    const match = CATEGORIES.find((c) => c.toLowerCase() === value.trim().toLowerCase());
    if (match) return match;
  }
  return DEFAULT_CATEGORY;
}

/** Short hints shown next to each category in the UI. */
export const CATEGORY_HINTS: Record<BuiltInCategory, string> = {
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
export const CATEGORY_COLOR_VAR: Record<BuiltInCategory, string> = {
  Groceries: "var(--series-1)",
  Transport: "var(--series-2)",
  Chill: "var(--series-3)",
  Subscriptions: "var(--series-4)",
  Lily: "var(--series-5)",
  Miscellaneous: "var(--series-6)",
};

/** Colours for your own categories, after the six built-in ones, in turn. */
const EXTRA_COLOR_VARS = [
  "var(--series-7)",
  "var(--series-8)",
  "var(--series-9)",
  "var(--series-10)",
  "var(--series-11)",
  "var(--series-12)",
];

/** A category as the app shows it. */
export type CategoryInfo = {
  name: Category;
  color: string;
  kind: "builtin" | "custom" | "trip";
  /** For a trip's category: the trip, and when it ends. */
  eventId?: string;
  endDate?: string | null;
  hint: string;
};

/**
 * Every category in display order: the six built-in ones, then your own in
 * the order they were added, trips' among them. Colours follow that order, so
 * a category keeps its colour as long as nothing before it is removed.
 */
export function categoryList(
  custom: readonly { name: string; event_id: string | null; event_end?: string | null }[] = [],
): CategoryInfo[] {
  return [
    ...CATEGORIES.map((name) => ({
      name,
      color: CATEGORY_COLOR_VAR[name],
      kind: "builtin" as const,
      hint: CATEGORY_HINTS[name],
    })),
    ...custom.map((c, index) => ({
      name: c.name,
      color: EXTRA_COLOR_VARS[index % EXTRA_COLOR_VARS.length],
      kind: c.event_id ? ("trip" as const) : ("custom" as const),
      eventId: c.event_id ?? undefined,
      endDate: c.event_end ?? null,
      hint: c.event_id
        ? "Your money on this trip: what you paid, less what was sent to you"
        : "Your own category",
    })),
  ];
}

/** A category's colour, falling back to neutral for one no longer listed. */
export function colorOf(name: string, list: readonly CategoryInfo[]): string {
  return list.find((c) => c.name === name)?.color ?? "var(--ink-muted)";
}
