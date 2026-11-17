import { formatRand } from "@/lib/money";

/** Spent against a budget, as a bar; over budget turns it red. */
export function SpendBar({
  spent,
  budget,
  label,
}: {
  spent: number;
  budget: number;
  label?: string;
}) {
  const over = budget > 0 && spent > budget;
  const percent = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        {label && <span className="font-medium">{label}</span>}
        <span className="ml-auto tabular text-ink-secondary">
          {formatRand(spent)}
          {budget > 0 && <span className="text-ink-muted"> of {formatRand(budget)}</span>}
        </span>
      </div>
      {budget > 0 && (
        <div
          className="h-2 overflow-hidden rounded-full bg-sunken"
          role="meter"
          aria-valuenow={spent}
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-label={label ? `${label} spent` : "Spent"}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${percent}%`,
              background: over ? "var(--critical)" : "var(--accent)",
            }}
          />
        </div>
      )}
      {over && (
        <p className="text-xs font-medium" style={{ color: "var(--critical)" }}>
          {formatRand(spent - budget)} over
        </p>
      )}
    </div>
  );
}
