import { redirect } from "next/navigation";

import { AddExpense } from "@/components/AddExpense";
import Link from "next/link";

import { resolveMonth } from "@/lib/data";
import { getEvent } from "@/lib/events-data";
import { formatMonthLong } from "@/lib/month";
import { formatPeriod, periodFor } from "@/lib/period";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add to the month - Budget" };

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; event?: string }>;
}) {
  const { m, event } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { monthKey, months } = await resolveMonth(supabase, user.id, m);
  const trip =
    event && /^[0-9a-f-]{36}$/i.test(event)
      ? await getEvent(supabase, user.id, event).catch(() => null)
      : null;

  if (trip) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <p className="text-sm">
            <Link
              href={`/budget/events/${trip.id}`}
              className="text-accent underline underline-offset-4"
            >
              ← {trip.name}
            </Link>
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            Add to {trip.name}
          </h1>
          <p className="text-sm text-ink-secondary">
            Scan or type each receipt and say who paid. What you paid also
            counts in your monthly budget; what others paid counts on the trip
            only.
          </p>
        </header>
        <AddExpense
          monthKey={monthKey}
          userId={user.id}
          starts={months}
          trip={{
            id: trip.id,
            name: trip.name,
            participants: trip.participants,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Add to the month
        </h1>
        <p className="text-sm text-ink-secondary">
          Photograph a slip and it gets read for you, type an expense in
          yourself, or record money that came in. Each goes to the budget month
          its date falls in - {formatMonthLong(monthKey)} runs{" "}
          {formatPeriod(periodFor(monthKey, months))} - and nothing is saved
          until you confirm it.
        </p>
      </header>

      <AddExpense monthKey={monthKey} userId={user.id} starts={months} />
    </div>
  );
}
