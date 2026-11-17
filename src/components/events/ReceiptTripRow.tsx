"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { assignReceiptToTrip, deleteReceipt } from "@/app/budget/actions";
import type { EventReceipt } from "@/lib/events-data";
import { EVENT_CATEGORIES, guessEventCategory, type Participant } from "@/lib/events";
import { formatRand } from "@/lib/money";

/**
 * One receipt on a trip, with who paid and its trip category changeable in
 * place. Changing the payer moves it in or out of your monthly budget.
 */
export function ReceiptTripRow({
  eventId,
  receipt,
  participants,
}: {
  eventId: string;
  receipt: EventReceipt;
  participants: Participant[];
}) {
  const router = useRouter();
  const me = participants.find((p) => p.is_me);
  const [paidBy, setPaidBy] = useState(receipt.paid_by ?? me?.id ?? "");
  const [category, setCategory] = useState<string>(
    receipt.event_category ?? guessEventCategory(receipt.category),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = participants.find((p) => p.id === paidBy)?.is_me ?? true;

  async function assign(next: { paidBy?: string; category?: string; remove?: boolean }) {
    setError(null);
    setBusy(true);
    const result = await assignReceiptToTrip({
      receiptId: receipt.id,
      eventId: next.remove ? null : eventId,
      paidBy: next.paidBy ?? paidBy,
      eventCategory: (next.category ?? category) as (typeof EVENT_CATEGORIES)[number],
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function remove() {
    const message = mine
      ? `Take "${receipt.store_name}" off this trip? It stays in your monthly budget.`
      : `Delete "${receipt.store_name}"? Someone else paid it, so it exists only on this trip.`;
    if (!window.confirm(message)) return;
    if (mine) {
      await assign({ remove: true });
      return;
    }
    setBusy(true);
    const result = await deleteReceipt(receipt.id);
    setBusy(false);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <li className="space-y-2 p-4">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{receipt.store_name}</span>
          <span className="text-xs text-ink-muted">
            {receipt.date}
            {receipt.line_count > 0 &&
              ` · ${receipt.line_count} item${receipt.line_count === 1 ? "" : "s"}`}
            {mine ? " · in your monthly budget" : " · trip only"}
          </span>
        </span>
        <span className="tabular font-semibold">{formatRand(receipt.total)}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs text-ink-muted">
          Paid by
          <select
            className="field !py-1.5 !text-sm"
            value={paidBy}
            disabled={busy}
            onChange={(e) => {
              setPaidBy(e.target.value);
              void assign({ paidBy: e.target.value });
            }}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.is_me ? "You" : p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-ink-muted">
          Category
          <select
            className="field !py-1.5 !text-sm"
            value={category}
            disabled={busy}
            onChange={(e) => {
              setCategory(e.target.value);
              void assign({ category: e.target.value });
            }}
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-xs font-medium text-ink-secondary underline underline-offset-4"
          disabled={busy}
          onClick={() => void remove()}
        >
          {mine ? "Take off this trip" : "Delete"}
        </button>
        {error && (
          <span role="alert" className="text-xs" style={{ color: "var(--critical)" }}>
            {error}
          </span>
        )}
      </div>
    </li>
  );
}
