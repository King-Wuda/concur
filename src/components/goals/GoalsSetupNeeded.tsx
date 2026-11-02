/** Shown until migration 0007 has been run on the database. */
export function GoalsSetupNeeded() {
  return (
    <section className="card space-y-2 p-4 sm:p-5">
      <h1 className="font-semibold">This needs one database step</h1>
      <p className="text-sm text-ink-secondary">
        Run <code>supabase/migrations/0007_goals_routine_body.sql</code> in the Supabase SQL
        editor. It only adds the new tables for goals, your routine and the body log - nothing
        you already have is touched. Then reload this page.
      </p>
    </section>
  );
}
