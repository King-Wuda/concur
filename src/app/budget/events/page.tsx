import Link from "next/link";
import { redirect } from "next/navigation";

import { EventsSetupNeeded } from "@/components/events/EventsSetupNeeded";
import { NewEventButton } from "@/components/events/EventForm";
import { SpendBar } from "@/components/events/SpendBar";
import { formatDateRange } from "@/lib/dates";
import { EventsNotSetUpError, listEvents } from "@/lib/events-data";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Trips & events - Budget" };

export default async function EventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let events;
  try {
    events = await listEvents(supabase, user.id);
  } catch (error) {
    if (error instanceof EventsNotSetUpError) return <EventsSetupNeeded />;
    throw error;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Trips &amp; events</h1>
        <p className="text-sm text-ink-secondary">
          An expense report per trip or occasion: its own budget, its receipts, and who paid for
          what.
        </p>
      </header>

      <NewEventButton startOpen={events.length === 0} />

      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id}>
            <Link href={`/budget/events/${event.id}`} className="card block space-y-3 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold">{event.name}</h2>
                <span className="shrink-0 text-xs text-ink-muted">
                  {event.participants.length === 1
                    ? "Just you"
                    : `${event.participants.length} people`}
                </span>
              </div>
              {formatDateRange(event.start_date, event.end_date) && (
                <p className="-mt-2 text-sm text-ink-secondary">
                  {formatDateRange(event.start_date, event.end_date)}
                </p>
              )}
              <SpendBar spent={event.summary.spent} budget={event.budget} />
              <p className="text-xs text-ink-muted">
                {event.receipts.length} receipt{event.receipts.length === 1 ? "" : "s"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
