"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { CategoryTotal } from "@/lib/aggregate";
import { CATEGORY_COLOR_VAR } from "@/lib/categories";
import { formatRand } from "@/lib/money";

/**
 * Share of the month's spend by category.
 *
 * Part-to-whole at a glance, six segments at most. Identity is carried by the
 * legend beside it - which also lists every amount, so the chart never relies
 * on colour alone and the figures stay readable for anyone who cannot separate
 * two of the hues.
 */
export function SpendPieChart({ categories }: { categories: CategoryTotal[] }) {
  // Negative category totals (a refund-heavy month) cannot be drawn as a share
  // of a whole, so they are listed in the legend but left out of the ring.
  const slices = categories.filter((category) => category.actual > 0);
  const total = slices.reduce((sum, category) => sum + category.actual, 0);

  if (slices.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        No spend recorded yet this month.
      </p>
    );
  }

  return (
    <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2 sm:items-center">
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="actual"
              nameKey="category"
              innerRadius="62%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={1.2}
              /* A 2px surface gap separates segments instead of a border. */
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((category) => (
                <Cell
                  key={category.category}
                  fill={CATEGORY_COLOR_VAR[category.category]}
                />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* The one number the ring is about, in the hole. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[0.6875rem] uppercase tracking-wide text-ink-muted">
            Spent
          </span>
          <span className="text-lg font-semibold">{formatRand(total)}</span>
        </div>
      </div>

      <ul className="space-y-1.5 text-sm">
        {categories.map((category) => (
          <li key={category.category} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: CATEGORY_COLOR_VAR[category.category] }}
            />
            <span className="truncate">{category.category}</span>
            <span
              className="ml-auto tabular text-ink-secondary"
              style={category.actual < 0 ? { color: "var(--good-ink)" } : undefined}
            >
              {formatRand(category.actual)}
            </span>
            <span className="w-16 shrink-0 text-right tabular text-ink-muted">
              {category.actual > 0 ? (
                `${category.share.toFixed(0)}%`
              ) : category.actual < 0 ? (
                /* More came back than went out, so this is not a share of
                   spending at all - say what it is instead of printing a
                   negative percentage of a whole. */
                <span title="More came back than was spent">back</span>
              ) : (
                "—"
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type TooltipPayload = { payload?: CategoryTotal };

function SliceTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  total: number;
}) {
  const slice = payload?.[0]?.payload;
  if (!active || !slice) return null;

  return (
    <div className="card px-3 py-2 text-sm shadow-lg">
      <div className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className="size-2.5 rounded-sm"
          style={{ background: CATEGORY_COLOR_VAR[slice.category] }}
        />
        {slice.category}
      </div>
      <div className="tabular text-ink-secondary">
        {formatRand(slice.actual)}
        {total > 0 && ` · ${((slice.actual / total) * 100).toFixed(0)}% of spend`}
      </div>
    </div>
  );
}
