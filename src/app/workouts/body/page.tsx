import { redirect } from "next/navigation";

import { BodyLogForm } from "@/components/workouts/BodyLogForm";
import { BodyTrends } from "@/components/workouts/BodyTrends";
import { GoalsSetupNeeded } from "@/components/goals/GoalsSetupNeeded";
import { averageSteps, formatSteps, weeklyChange, withWeightAverage } from "@/lib/body";
import { GoalsNotSetUpError, listBodyLogs } from "@/lib/goals-data";
import { isIsoDate } from "@/lib/month";
import { todayInSouthAfrica } from "@/lib/period";
import { addDays, formatDay } from "@/lib/routine";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Body - Workouts" };

/** Morning weight and the day's steps, with how both are trending. */
export default async function BodyPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const today = todayInSouthAfrica();
  const date = isIsoDate(d) && d <= today ? d : today;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let logs;
  try {
    logs = await listBodyLogs(supabase, user.id, addDays(today, -89));
  } catch (error) {
    if (error instanceof GoalsNotSetUpError) return <GoalsSetupNeeded />;
    throw error;
  }

  const entry = logs.find((log) => log.date === date) ?? null;
  const change = weeklyChange(logs, today);
  const steps = averageSteps(logs, today);
  const recent = [...logs].reverse().slice(0, 14);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Body</h1>
        <p className="text-sm text-ink-secondary">
          Weigh in each morning and add your steps before bed. Daily weight swings with water
          and food, so watch the 7-day average.
        </p>
      </header>

      <BodyLogForm
        key={`${date}-${entry?.weight_kg}-${entry?.steps}`}
        date={date}
        today={today}
        dateLabel={date === today ? "Today" : formatDay(date)}
        weight={entry?.weight_kg ?? null}
        steps={entry?.steps ?? null}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm text-ink-secondary">Weight, this week vs last</p>
          <p className="text-2xl font-semibold tabular">
            {change === null ? "—" : `${change > 0 ? "+" : ""}${change} kg`}
          </p>
          <p className="text-xs text-ink-muted">Average of the last 7 days against the 7 before</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-ink-secondary">Steps, daily average</p>
          <p className="text-2xl font-semibold tabular">
            {steps === null ? "—" : formatSteps(steps)}
          </p>
          <p className="text-xs text-ink-muted">Over the last 7 days</p>
        </div>
      </section>

      <BodyTrends logs={withWeightAverage(logs)} />

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Recent days</h2>
          <table className="card w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-4 py-2 font-medium">Day</th>
                <th className="px-4 py-2 text-right font-medium">Weight</th>
                <th className="px-4 py-2 text-right font-medium">Steps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {recent.map((log) => (
                <tr key={log.date}>
                  <td className="px-4 py-2">
                    <a
                      href={`/workouts/body?d=${log.date}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {formatDay(log.date)}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {log.weight_kg === null ? "—" : `${log.weight_kg} kg`}
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {log.steps === null ? "—" : formatSteps(log.steps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-muted">Tap a day to correct it.</p>
        </section>
      )}
    </div>
  );
}
