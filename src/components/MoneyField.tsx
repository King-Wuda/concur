"use client";

/**
 * A rand input. The value stays a string while it is being typed - parsing
 * happens on save - so a partially typed number is never rewritten mid-keystroke.
 */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  onBlur,
  hint,
  action,
  badge,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  hint?: string;
  action?: { label: string; onClick: () => void };
  /** A small tag beside the label, e.g. "Trip". */
  badge?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {badge && (
            <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-secondary">
              {badge}
            </span>
          )}
        </label>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="text-xs font-medium text-accent underline underline-offset-4"
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-muted"
        >
          R
        </span>
        <input
          id={id}
          className="field field-money !pl-7"
          inputMode="decimal"
          value={value}
          placeholder="0.00"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </div>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
