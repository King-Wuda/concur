import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventActions } from "@/components/events/EventActions";
import { EventsSetupNeeded } from "@/components/events/EventsSetupNeeded";
import { PeopleEditor } from "@/components/events/PeopleEditor";
import { ReceiptTripRow } from "@/components/events/ReceiptTripRow";
import { SpendBar } from "@/components/events/SpendBar";
import { formatDateRange } from "@/lib/dates";
import { EventsNotSetUpError, getEvent } from "@/lib/events-data";
import { formatRand, sum } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Trip - Budget" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let event;
  try {
    event = await getEvent(supabase, user.id, id);
  } catch (error) {
    if (error instanceof EventsNotSetUpError) return <EventsSetupNeeded />;
    throw error;
  }
  if (!event) notFound();

  const { summary } = event;
  const me = summary.people.find((p) => p.participant.is_me);
  const othersPaid = sum(summary.people.filter((p) => !p.participant.is_me).map((p) => p.paid));
  const nameOf = (p: { name: string; is_me: boolean }) => (p.is_me ? "You" : p.name);
  const categories = summary.categories.filter((c) => c.budgeted > 0 || c.spent > 0);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-sm">
          <Link href="/budget/events" className="text-accent underline underline-offset-4">
            ← Trips &amp; events
          </Link>
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
        {formatDateRange(event.start_date, event.end_date) && (
          <p className="text-sm text-ink-secondary">
            {formatDateRange(event.start_date, event.end_date)}
          </p>
        )}
        {event.notes && <p className="text-sm text-ink-muted">{event.notes}</p>}
      </header>

      <section className="card space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-secondary">
              {summary.isOver ? "Over budget" : event.budget > 0 ? "Left in the budget" : "Spent"}
            </p>
            <p
              className="text-3xl font-semibold tabular"
              style={{
                color: summary.isOver
                  ? "var(--critical)"
                  : event.budget > 0
                    ? "var(--good-ink)"
                    : undefined,
              }}
            >
              {formatRand(event.budget > 0 ? Math.abs(summary.remaining) : summary.spent)}
            </p>
          </div>
          <Link href={`/budget/add?event=${event.id}`} className="btn btn-primary">
            Add receipts
          </Link>
        </div>
        <SpendBar spent={summary.spent} budget={event.budget} label="Spent" />
      </section>

      {categories.length > 0 && (
        <section className="card space-y-3 p-4 sm:p-5">
          <h2 className="font-semibold">By category</h2>
          {categories.map((c) => (
            <SpendBar key={c.category} spent={c.spent} budget={c.budgeted} label={c.category} />
          ))}
        </section>
      )}

      {event.participants.length > 1 && (
        <section className="card space-y-4 p-4 sm:p-5">
          <header>
            <h2 className="font-semibold">Who paid</h2>
            <p className="text-sm text-ink-secondary">
              You covered {formatRand(me?.paid ?? 0)}, others {formatRand(othersPaid)}. Split
              equally, everyone&apos;s share is{" "}
              {formatRand(summary.people[summary.people.length - 1]?.share ?? 0)}.
            </p>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="pb-1 font-medium">Person</th>
                <th className="pb-1 text-right font-medium">Paid</th>
                <th className="pb-1 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {summary.people.map((p) => (
                <tr key={p.participant.id}>
                  <td className="py-2 font-medium">{nameOf(p.participant)}</td>
                  <td className="py-2 text-right tabular">{formatRand(p.paid)}</td>
                  <td
                    className="py-2 text-right tabular"
                    style={{
                      color:
                        p.balance > 0.004
                          ? "var(--good-ink)"
                          : p.balance < -0.004
                            ? "var(--critical)"
                            : undefined,
                    }}
                  >
                    {p.balance > 0.004
                      ? `owed ${formatRand(p.balance)}`
                      : p.balance < -0.004
                        ? `owes ${formatRand(-p.balance)}`
                        : "square"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1.5 rounded-lg bg-sunken p-3">
            <h3 className="text-sm font-medium">Settle up</h3>
            {summary.settlements.length === 0 ? (
              <p className="text-sm text-ink-secondary">Everyone is square.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.settlements.map((s, index) => (
                  <li key={index} className="flex justify-between gap-3">
                    <span>
                      <span className="font-medium">{nameOf(s.from)}</span>{" "}
                      {s.from.is_me ? "pay" : "pays"}{" "}
                      <span className="font-medium">{nameOf(s.to)}</span>
                    </span>
                    <span className="tabular font-medium">{formatRand(s.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">
          Receipts <span className="font-normal text-ink-muted">({event.receipts.length})</span>
        </h2>
        {event.receipts.length === 0 ? (
          <p className="card p-4 text-sm text-ink-secondary">
            No receipts yet. Tap <span className="font-medium">Add receipts</span> to scan or type
            them, and say who paid for each.
          </p>
        ) : (
          <ul className="card divide-y divide-[var(--border)]">
            {event.receipts.map((receipt) => (
              <ReceiptTripRow
                key={`${receipt.id}-${receipt.paid_by}-${receipt.event_category}`}
                eventId={event.id}
                receipt={receipt}
                participants={event.participants}
              />
            ))}
          </ul>
        )}
      </section>

      <PeopleEditor
        eventId={event.id}
        participants={event.participants}
        paidIds={[...new Set(event.receipts.map((r) => r.paid_by).filter(Boolean) as string[])]}
      />

      <EventActions
        event={{
          id: event.id,
          name: event.name,
          start_date: event.start_date,
          end_date: event.end_date,
          budget: event.budget,
          notes: event.notes,
          budgets: event.budgets,
        }}
        othersReceipts={event.receipts.filter((r) => r.month_id === null).length}
      />
    </div>
  );
}
