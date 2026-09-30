"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveIncome } from "@/app/actions";
import { formatRand, parseRand } from "@/lib/money";
import { defaultDateInMonth, formatMonthLong, type MonthKey } from "@/lib/month";

/**
 * Recording money that came in: someone sending money, a refund, a side job.
 *
 * Shorter than the expense form, because income has less to say about itself.
 * There is no category and no line items: the six categories are spending
 * budgets, so filing money received under one would push that category's actual
 * down, its meter would read wrong and its slice of the pie chart would
 * mislead. Income raises what there is to spend instead.
 *
 * A refund that genuinely belongs against a category's spend is better recorded
 * on the expense itself, as a negative line item.
 */
export function IncomeForm({ monthKey }: { monthKey: MonthKey }) {
  const router = useRouter();

  const [source, setSource] = useState("");
  const [date, setDate] = useState(() => defaultDateInMonth(monthKey));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const parsedAmount = parseRand(amount);

  function clear() {
    setSource("");
    setDate(defaultDateInMonth(monthKey));
    setAmount("");
    setNote("");
  }

  async function save(andAnother: boolean) {
    setError(null);
    setSavedMessage(null);

    if (parsedAmount <= 0) {
      setError("Enter how much came in.");
      return;
    }

    setSaving(true);
    const result = await saveIncome({
      monthKey,
      source: source.trim() || "Money in",
      date,
      amount: parsedAmount,
      note: note.trim() || null,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (andAnother) {
      const saved = source.trim() || "Money in";
      clear();
      setSavedMessage(`${saved} saved. Ready for the next one.`);
      router.refresh();
      return;
    }

    router.push(`/?m=${monthKey}`);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {savedMessage && (
        <p role="status" className="text-sm" style={{ color: "var(--good-ink)" }}>
          {savedMessage}
        </p>
      )}

      <div className="card space-y-3 p-4">
        <div className="space-y-1.5">
          <label htmlFor="income-source" className="text-sm font-medium">
            Who or what it came from
          </label>
          <input
            id="income-source"
            className="field"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Mum, refund, side job..."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="income-date" className="text-sm font-medium">
              Date
            </label>
            <input
              id="income-date"
              type="date"
              className="field"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="income-amount" className="text-sm font-medium">
              Amount received
            </label>
            <input
              id="income-amount"
              className="field field-money"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                // Clear "enter how much came in" as soon as they have.
                setError(null);
              }}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="income-note" className="text-sm font-medium">
            Note <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="income-note"
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="For the car service"
          />
        </div>
      </div>

      <p className="text-sm text-ink-secondary">
        This adds to what you have to spend for the month. It is not put into a
        category — those are spending budgets.
      </p>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void save(false)}
        >
          {saving ? "Saving..." : "Save income"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={saving}
          onClick={() => void save(true)}
        >
          Save and add another
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        Saving to {formatMonthLong(monthKey)} · {formatRand(parsedAmount)} in
      </p>
    </div>
  );
}
