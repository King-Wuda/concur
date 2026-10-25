/** Shown until migration 0006 has been run on the database. */
export function WorkoutsSetupNeeded() {
  return (
    <section className="card space-y-2 p-4 sm:p-5">
      <h1 className="font-semibold">Workouts needs one database step</h1>
      <p className="text-sm text-ink-secondary">
        Run <code>supabase/migrations/0006_workouts.sql</code> in the Supabase SQL editor.
        It only adds the workout tables - your budget data is not touched. Then reload
        this page and your A/B/C plan will be set up.
      </p>
    </section>
  );
}
