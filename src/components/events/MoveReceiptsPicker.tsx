"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { moveReceiptsToTrip } from "@/app/budget/actions";
import { useCategoryColor } from "@/components/CategoriesContext";
import type { MovableReceipt } from "@/lib/events-data";
import { formatRand, sum } from "@/lib/money";

/**
 * Receipts already saved - say scanned into the month before the trip was set
 * up - ticked off and moved onto this trip together, as paid by you.
 */
export function MoveReceiptsPicker({
  eventId,
  receipts,
  rangeLabel,
}: {
  eventId: string;
  receipts: MovableReceipt[];
  /** "15 Dec – 3 Jan", the dates the list covers. */
  rangeLabel: string;
}) {
  const router = useRouter();
  const colorFor = useCategoryColor();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = sum(receipts.filter((r) => picked.has(r.id)).map((r) => r.total));

  async function move() {
    setError(null);
    setSaving(true);
    const result = await moveReceiptsToTrip([...picked], eventId);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPicked(new Set());
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Add existing receipts
      </button>
    );
  }

  return (
    <section className="card space-y-3 p-4">
      <header>
        <h3 className="font-semibold">Move receipts onto this trip</h3>
        <p className="text-sm text-ink-secondary">
          Receipts not on a trip, from {rangeLabel}. They move as paid by you, into this
          trip&apos;s category; change who paid afterwards if someone else did.
        </p>
      </header>

      {receipts.length === 0 ? (
        <p className="text-sm text-ink-muted">No receipts from those dates that are not on a trip.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="font-medium text-accent underline underline-offset-4"
              onClick={() =>
                setPicked(
                  picked.size === receipts.length ? new Set() : new Set(receipts.map((r) => r.id)),
                )
              }
            >
              {picked.size === receipts.length ? "Clear" : "Select all"}
            </button>
            <span className="text-ink-muted">{receipts.length} receipts</span>
          </div>
          <ul className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-line">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-[var(--accent)]"
                    checked={picked.has(receipt.id)}
                    onChange={() => toggle(receipt.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{receipt.store_name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <span
                        aria-hidden
                        className="size-2 rounded-sm"
                        style={{ background: colorFor(receipt.category) }}
                      />
                      {receipt.date} · {receipt.category}
                    </span>
                  </span>
                  <span className="text-sm tabular">{formatRand(receipt.total)}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || picked.size === 0}
          onClick={() => void move()}
        >
          {saving
            ? "Moving..."
            : picked.size === 0
              ? "Move receipts"
              : `Move ${picked.size} (${formatRand(total)})`}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
