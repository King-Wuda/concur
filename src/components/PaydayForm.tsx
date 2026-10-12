"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { savePayday } from "@/app/actions";
import { SaveBar } from "@/components/SaveBar";
import {
  formatMonthLong,
  isIsoDate,
  shiftMonth,
  type MonthKey,
} from "@/lib/month";
import {
  DEFAULT_PAYDAY,
  formatPeriod,
  paydayFor,
  paydayProblem,
  periodFor,
  type MonthStart,
} from "@/lib/period";

/**
 * When this budget month starts. Normally payday on the 24th of the month
 * before; changed only when salary lands on another day, and then for this
 * month alone.
 */
export function PaydayForm({
  monthKey,
  starts,
}: {
  monthKey: MonthKey;
  starts: MonthStart[];
}) {
  const router = useRouter();
  const stored = starts.find((s) => s.month === monthKey)?.periodStart ?? null;
  const usual = paydayFor(monthKey, []);

  const [payday, setPayday] = useState(stored ?? usual);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const valid = isIsoDate(payday);
  const problem = valid
    ? paydayProblem(monthKey, payday, starts)
    : "Pick a date.";
  const preview = [
    ...starts.filter((s) => s.month !== monthKey),
    { month: monthKey, periodStart: payday === usual ? null : payday },
  ];

  async function save(next: string | null) {
    setError(null);
    setStatus("saving");
    const result = await savePayday({ monthKey, payday: next });
    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }
    setStatus("saved");
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <header>
        <h2 className="font-semibold">Pay period</h2>
        <p className="text-sm text-ink-secondary">
          {formatMonthLong(monthKey)} runs{" "}
          <span className="font-medium text-ink tabular">
            {formatPeriod(periodFor(monthKey, starts))}
          </span>
          : from payday to the day before the next one. Receipts are filed by
          the date on them.
        </p>
      </header>

      <div className="space-y-1.5 sm:max-w-xs">
        <label htmlFor="payday" className="text-sm font-medium">
          Paid on
        </label>
        <input
          id="payday"
          type="date"
          className="field"
          value={payday}
          min={`${shiftMonth(monthKey, -1)}-01`}
          onChange={(event) => {
            setPayday(event.target.value);
            setStatus("idle");
          }}
        />
        <p className="text-xs text-ink-muted">
          {problem && payday !== (stored ?? usual)
            ? problem
            : `Usually the ${DEFAULT_PAYDAY}th. Change it if salary came early or late this month - ${formatMonthLong(
                shiftMonth(monthKey, -1),
              )} will end the day before${
                valid && !problem
                  ? `, and this month will run ${formatPeriod(periodFor(monthKey, preview))}`
                  : ""
              }.`}
        </p>
      </div>

      <SaveBar
        status={status}
        error={error}
        onSave={() => {
          if (problem) {
            setError(problem);
            return;
          }
          return save(payday === usual ? null : payday);
        }}
      >
        {stored && (
          <button
            type="button"
            className="btn"
            disabled={status === "saving"}
            onClick={() => {
              setPayday(usual);
              void save(null);
            }}
          >
            Back to the {DEFAULT_PAYDAY}th
          </button>
        )}
      </SaveBar>
    </section>
  );
}
