import type { CategoryTotal } from "@/lib/aggregate";
import { CATEGORY_COLOR_VAR } from "@/lib/categories";
import { formatRand } from "@/lib/money";

/**
 * Budget versus actual, one meter per category.
 *
 * Each row is a ratio against a limit, so it is drawn as a meter rather than a
 * pair of bars: the track is the budget, the fill is what has been spent, and
 * anything past the budget is drawn in the critical colour with an explicit
 * "over" label - colour never carries that meaning on its own. The figures are
 * always visible, so this doubles as the table view of the chart above.
 */
export function BudgetMeters({ categories }: { categories: CategoryTotal[] }) {
  const hasAnyBudget = categories.some((category) => category.budgeted > 0);

  return (
    <div className="space-y-3.5">
      {categories.map((category) => (
        <Meter key={category.category} category={category} />
      ))}

      {!hasAnyBudget && (
        <p className="pt-1 text-sm text-ink-muted">
          No budgets set for this month yet - set them on the Plan tab and these
          meters will fill in.
        </p>
      )}
    </div>
  );
}

function Meter({ category }: { category: CategoryTotal }) {
  const { budgeted, actual, variance, isOver } = category;
  const color = CATEGORY_COLOR_VAR[category.category];

  // With a budget, the track is the budget and the fill is the spend. Once
  // over, the track represents the overspent total so the excess is visible as
  // its own segment rather than silently clipped at 100%.
  const scale = Math.max(budgeted, actual, 1);
  const withinWidth = (Math.max(Math.min(actual, budgeted), 0) / scale) * 100;
  const overWidth = isOver ? ((actual - Math.max(budgeted, 0)) / scale) * 100 : 0;

  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span
          aria-hidden
          className="size-2.5 shrink-0 translate-y-[-1px] rounded-sm"
          style={{ background: color }}
        />
        <span className="font-medium">{category.category}</span>

        {isOver && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold"
            style={{ color: "var(--critical)", background: "color-mix(in srgb, var(--critical) 12%, transparent)" }}
          >
            <WarningIcon />
            Over
          </span>
        )}

        <span className="ml-auto tabular text-ink-secondary">
          {formatRand(actual)}
          <span className="text-ink-muted"> / {formatRand(budgeted)}</span>
        </span>
      </div>

      <div
        className="mt-1.5 h-2 w-full overflow-hidden rounded"
        style={{ background: "var(--grid)" }}
        role="img"
        aria-label={`${category.category}: ${formatRand(actual)} spent of ${formatRand(
          budgeted,
        )} budgeted, ${isOver ? "over budget" : "within budget"}.`}
      >
        <div className="flex h-full">
          <div style={{ width: `${withinWidth}%`, background: color }} />
          {overWidth > 0 && (
            <div
              /* 2px of surface separates the two fills instead of a border. */
              style={{
                width: `${overWidth}%`,
                background: "var(--critical)",
                marginLeft: 2,
              }}
            />
          )}
        </div>
      </div>

      <p className="mt-1 text-xs tabular text-ink-muted">
        {budgeted > 0
          ? `${category.usedPercent.toFixed(0)}% of budget · ${
              isOver ? `${formatRand(Math.abs(variance))} over` : `${formatRand(variance)} left`
            }`
          : actual > 0
            ? `${formatRand(actual)} spent with no budget set`
            : "Nothing budgeted, nothing spent"}
      </p>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 4.5 2.8 20h18.4Z" />
      <path d="M12 10.5v4M12 17.4v.2" />
    </svg>
  );
}
