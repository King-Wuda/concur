/** Shown until migration 0009 has been run on the database. */
export function EventsSetupNeeded() {
  return (
    <section className="card space-y-2 p-4 sm:p-5">
      <h1 className="font-semibold">Trips need one database step</h1>
      <p className="text-sm text-ink-secondary">
        Run <code>supabase/migrations/0009_events.sql</code> in the Supabase SQL editor. It adds
        the tables for trips and events - your receipts and budgets are not changed. Then reload
        this page.
      </p>
    </section>
  );
}
