import { redirect } from "next/navigation";

import { GoalsBoard } from "@/components/goals/GoalsBoard";
import { GoalsSetupNeeded } from "@/components/goals/GoalsSetupNeeded";
import { GoalsNotSetUpError, listChecks, listGoals, listHabits } from "@/lib/goals-data";
import { todayInSouthAfrica } from "@/lib/period";
import { addDays, consistencyOf, describeSchedule } from "@/lib/routine";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Goals" };

const WINDOW = 56;

export default async function GoalsPage() {
  const today = todayInSouthAfrica();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let goals, habits, checks;
  try {
    [goals, habits, checks] = await Promise.all([
      listGoals(supabase, user.id),
      listHabits(supabase, user.id),
      listChecks(supabase, user.id, addDays(today, -(WINDOW - 1))),
    ]);
  } catch (error) {
    if (error instanceof GoalsNotSetUpError) return <GoalsSetupNeeded />;
    throw error;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Life goals</h1>
        <p className="text-sm text-ink-secondary">
          In priority order: the top one matters most right now. Break each into milestones and
          tick them off as you go.
        </p>
      </header>

      <GoalsBoard
        today={today}
        goals={goals.map((goal) => ({
          ...goal,
          habits: habits
            .filter((habit) => habit.goal_id === goal.id)
            .map((habit) => ({
              name: habit.name,
              schedule: describeSchedule(habit.weekdays),
              consistency: consistencyOf(
                { weekdays: habit.weekdays, created: habit.created_at },
                checks.get(habit.id) ?? new Set(),
                today,
                WINDOW,
              ),
            })),
        }))}
      />
    </div>
  );
}
