import { redirect } from "next/navigation";

import { SessionList } from "@/components/workouts/SessionList";
import { WorkoutsSetupNeeded } from "@/components/workouts/WorkoutsSetupNeeded";
import { createClient } from "@/lib/supabase/server";
import { listSessions, WorkoutsNotSetUpError } from "@/lib/workout-data";

export const metadata = { title: "History - Workouts" };

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let sessions;
  try {
    sessions = await listSessions(supabase, user.id, 200);
  } catch (error) {
    if (error instanceof WorkoutsNotSetUpError) return <WorkoutsSetupNeeded />;
    throw error;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-ink-secondary">
          {sessions.length === 0
            ? "Nothing logged yet. Workouts you save on the Train tab show up here."
            : `${sessions.length} workout${sessions.length === 1 ? "" : "s"} logged, newest first.`}
        </p>
      </header>
      <SessionList sessions={sessions} />
    </div>
  );
}
