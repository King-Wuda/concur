"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteEvent } from "@/app/budget/events/actions";
import { EventForm } from "@/components/events/EventForm";
import type { EventCategory } from "@/lib/events";

/** Edit the trip's details and budgets, or delete it. */
export function EventActions({
  event,
  othersReceipts,
}: {
  event: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    budget: number;
    notes: string | null;
    budgets: Partial<Record<EventCategory, number>>;
  };
  othersReceipts: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) return <EventForm initial={event} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="btn" onClick={() => setEditing(true)}>
        Edit trip &amp; budget
      </button>
      <button
        type="button"
        className="btn btn-danger ml-auto"
        onClick={async () => {
          const extra =
            othersReceipts > 0
              ? ` The ${othersReceipts} receipt${othersReceipts === 1 ? "" : "s"} others paid will be deleted;`
              : "";
          if (
            !window.confirm(
              `Delete ${event.name}?${extra} receipts you paid stay in your monthly budget.`,
            )
          ) {
            return;
          }
          const result = await deleteEvent(event.id);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/budget/events");
        }}
      >
        Delete trip
      </button>
      {error && (
        <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
