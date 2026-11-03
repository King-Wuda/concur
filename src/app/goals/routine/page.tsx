import { redirect } from "next/navigation";

import { GoalsSetupNeeded } from "@/components/goals/GoalsSetupNeeded";
import { RoutineEditor } from "@/components/goals/RoutineEditor";
import { GoalsNotSetUpError, listChecks, listGoals, listHabits } from "@/lib/goals-data";
import { todayInSouthAfrica } from "@/lib/period";
import { addDays, byTime, consistencyOf, recentDays } from "@/lib/routine";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Routine - Goals" };

const WINDOW = 56; // eight weeks

export default async function RoutinePage() {
  const today = todayInSouthAfrica();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let habits, checks, goals;
  try {
    [habits, checks, goals] = await Promise.all([
      listHabits(supabase, user.id),
      listChecks(supabase, user.id, addDays(today, -(WINDOW - 1))),
      listGoals(supabase, user.id),
    ]);
  } catch (error) {
    if (error instanceof GoalsNotSetUpError) return <GoalsSetupNeeded />;
    throw error;
  }

  const activeGoals = goals.filter((goal) => !goal.achieved_at);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Routine</h1>
        <p className="text-sm text-ink-secondary">
          The things you do on a schedule, in time order. Pick the days each one happens, and it
          shows up on those days&apos; Today list to tick off. Consistency counts the last eight
          weeks.
        </p>
      </header>

      <RoutineEditor
        goals={activeGoals.map((goal) => ({ id: goal.id, title: goal.title }))}
        habits={byTime(habits).map((habit) => {
          const ticked = checks.get(habit.id) ?? new Set<string>();
          const schedule = { weekdays: habit.weekdays, created: habit.created_at };
          return {
            id: habit.id,
            name: habit.name,
            weekdays: habit.weekdays,
            goalId: habit.goal_id,
            goalTitle: goals.find((goal) => goal.id === habit.goal_id)?.title ?? null,
            startTime: habit.start_time,
            endTime: habit.end_time,
            category: habit.category,
            notes: habit.notes,
            consistency: consistencyOf(schedule, ticked, today, WINDOW),
            recent: recentDays(schedule, ticked, today),
          };
        })}
      />
    </div>
  );
}
