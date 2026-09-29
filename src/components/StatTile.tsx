import { formatRand } from "@/lib/money";

/**
 * A single headline figure. Used instead of a one-bar chart: the number is the
 * chart. `tone` is only ever set when the value genuinely means good or bad.
 */
export function StatTile({
  label,
  value,
  detail,
  tone = "neutral",
  size = "normal",
}: {
  label: string;
  value: number | string;
  detail?: string;
  tone?: "neutral" | "good" | "critical";
  size?: "normal" | "hero";
}) {
  const toneColor =
    tone === "good" ? "var(--good-ink)" : tone === "critical" ? "var(--critical)" : undefined;

  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={`mt-1 font-semibold ${size === "hero" ? "text-3xl sm:text-4xl" : "text-xl"}`}
        style={toneColor ? { color: toneColor } : undefined}
      >
        {typeof value === "number" ? formatRand(value) : value}
      </p>
      {detail && <p className="mt-1 text-sm text-ink-secondary">{detail}</p>}
    </div>
  );
}
