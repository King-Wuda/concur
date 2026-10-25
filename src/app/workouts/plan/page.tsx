import { redirect } from "next/navigation";

import { AddDayButton, DayEditor } from "@/components/workouts/PlanEditor";
import { WorkoutsSetupNeeded } from "@/components/workouts/WorkoutsSetupNeeded";
import { createClient } from "@/lib/supabase/server";
import { ensurePlan, WorkoutsNotSetUpError } from "@/lib/workout-data";
import { PROGRESSION_RULE, SCHEME_RULES } from "@/lib/workouts";

export const metadata = { title: "Plan - Workouts" };

export default async function WorkoutPlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let days;
  try {
    days = await ensurePlan(supabase, user.id);
  } catch (error) {
    if (error instanceof WorkoutsNotSetUpError) return <WorkoutsSetupNeeded />;
    throw error;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Training plan</h1>
        <p className="text-sm text-ink-secondary">
          The days rotate in order: after the last one, the first comes round again.
          Changing the plan never changes workouts already logged.
        </p>
        <p className="text-xs text-ink-muted">
          {SCHEME_RULES} {PROGRESSION_RULE}
        </p>
      </header>

      {days.map((day) => (
        <DayEditor
          key={`${day.id}-${day.exercises.map((e) => e.id).join()}`}
          day={day}
          canDelete={days.length > 1}
        />
      ))}

      <AddDayButton />
    </div>
  );
}
