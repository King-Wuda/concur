"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { moveReceiptsToTrip } from "@/app/budget/actions";
import type { TripOption } from "@/lib/events-data";

/**
 * On a receipt from the Receipts page: which trip it is on, or a way to move
 * it onto one.
 */
export function ReceiptTripControl({
  receiptId,
  eventId,
  trips,
  onMoved,
}: {
  receiptId: string;
  eventId: string | null | undefined;
  trips: TripOption[];
  /** Called once moved, so an open edit form closes instead of saving stale values over it. */
  onMoved?: () => void;
}) {
  const router = useRouter();
  const [target, setTarget] = useState(trips[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = eventId ? trips.find((t) => t.id === eventId) : undefined;
  if (eventId) {
    return (
      <p className="rounded-lg bg-sunken px-3 py-2 text-sm">
        On{" "}
        <Link href={`/budget/events/${eventId}`} className="font-medium text-accent underline underline-offset-4">
          {current?.name ?? "a trip"}
        </Link>{" "}
        - change who paid or take it off there.
      </p>
    );
  }
  if (trips.length === 0) return null;

  async function move() {
    setError(null);
    setBusy(true);
    const result = await moveReceiptsToTrip([receiptId], target);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onMoved?.();
    router.refresh();
  }

  return (
    <div className="space-y-1.5 rounded-lg bg-sunken p-3">
      <label htmlFor={`trip-${receiptId}`} className="text-sm font-medium">
        Move to a trip
      </label>
      <div className="flex gap-2">
        <select
          id={`trip-${receiptId}`}
          className="field"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn shrink-0" disabled={busy || !target} onClick={() => void move()}>
          {busy ? "Moving..." : "Move"}
        </button>
      </div>
      <p className="text-xs text-ink-muted">
        As paid by you, into the trip&apos;s category. Its date and month stay the same.
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
