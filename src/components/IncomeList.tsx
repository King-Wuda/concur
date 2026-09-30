"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteIncome, updateIncome } from "@/app/actions";
import { formatRand, parseRand, round2 } from "@/lib/money";
import type { IncomeRow } from "@/lib/types";

/**
 * The month's income, each row editable in place. Shown in the good/positive
 * colour with an explicit "+" so it never reads as another expense at a glance -
 * the sign carries the meaning, not the colour alone.
 */
export function IncomeList({ income }: { income: IncomeRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="space-y-2">
      {income.map((row) => (
        <li key={row.id} className="card overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center gap-3 p-4 text-left"
            aria-expanded={openId === row.id}
            onClick={() => setOpenId((current) => (current === row.id ? null : row.id))}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: "var(--good)" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{row.source}</span>
              <span className="text-xs text-ink-muted">
                {row.date}
                {row.note ? ` · ${row.note}` : ""}
              </span>
            </span>
            <span className="tabular font-semibold" style={{ color: "var(--good-ink)" }}>
              +{formatRand(Number(row.amount))}
            </span>
          </button>

          {openId === row.id && (
            <IncomeEditor row={row} onClose={() => setOpenId(null)} />
          )}
        </li>
      ))}
    </ul>
  );
}

function IncomeEditor({ row, onClose }: { row: IncomeRow; onClose: () => void }) {
  const router = useRouter();

  const [source, setSource] = useState(row.source);
  const [date, setDate] = useState(row.date);
  const [amount, setAmount] = useState(String(round2(Number(row.amount) || 0)));
  const [note, setNote] = useState(row.note ?? "");

  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    setBusy("save");
    setError(null);

    const result = await updateIncome({
      id: row.id,
      source: source.trim() || "Money in",
      date,
      amount: parseRand(amount),
      note: note.trim() || null,
    });

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const result = await deleteIncome(row.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor={`source-${row.id}`} className="text-sm font-medium">
            Who or what it came from
          </label>
          <input
            id={`source-${row.id}`}
            className="field"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`income-date-${row.id}`} className="text-sm font-medium">
            Date
          </label>
          <input
            id={`income-date-${row.id}`}
            type="date"
            className="field"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`income-amount-${row.id}`} className="text-sm font-medium">
            Amount received
          </label>
          <input
            id={`income-amount-${row.id}`}
            className="field field-money"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor={`income-note-${row.id}`} className="text-sm font-medium">
            Note
          </label>
          <input
            id={`income-note-${row.id}`}
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => void save()}
        >
          {busy === "save" ? "Saving..." : "Save changes"}
        </button>

        <button type="button" className="btn" disabled={busy !== null} onClick={onClose}>
          Cancel
        </button>

        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy !== null}
              onClick={() => void remove()}
            >
              {busy === "delete" ? "Deleting..." : "Yes, delete it"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
