import Link from "next/link";
import { redirect } from "next/navigation";

import { GoalsSetupNeeded } from "@/components/goals/GoalsSetupNeeded";
import { TodayChecklist } from "@/components/goals/TodayChecklist";
import { GoalsNotSetUpError, listChecks, listHabits } from "@/lib/goals-data";
import { isIsoDate } from "@/lib/month";
import { todayInSouthAfrica } from "@/lib/period";
import { addDays, describeSchedule, formatDay, isDue } from "@/lib/routine";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Today - Goals" };

/**
 * What the routine asks of one day - today by default - to tick off as it gets
 * done. Habits not scheduled for the day are listed underneath, out of the way.
 */
export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const today = todayInSouthAfrica();
  const earliest = addDays(today, -7);
  const date = isIsoDate(d) && d <= today && d >= earliest ? d : today;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let habits, checks;
  try {
    [habits, checks] = await Promise.all([
      listHabits(supabase, user.id),
      listChecks(supabase, user.id, earliest),
    ]);
  } catch (error) {
    if (error instanceof GoalsNotSetUpError) return <GoalsSetupNeeded />;
    throw error;
  }

  const due = habits.filter((habit) => isDue(habit, date) && habit.created_at <= date);
  const notToday = habits.filter((habit) => !due.includes(habit));

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Link
          href={`/goals?d=${addDays(date, -1)}`}
          aria-disabled={date <= earliest}
          className={`btn size-11 !p-0 ${date <= earliest ? "pointer-events-none opacity-40" : ""}`}
          aria-label="Previous day"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-lg font-semibold tracking-tight">
            {date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : formatDay(date)}
          </h1>
          <p className="text-sm text-ink-muted">{formatDay(date)}</p>
        </div>
        <Link
          href={date === addDays(today, -1) ? "/goals" : `/goals?d=${addDays(date, 1)}`}
          aria-disabled={date >= today}
          className={`btn size-11 !p-0 ${date >= today ? "pointer-events-none opacity-40" : ""}`}
          aria-label="Next day"
        >
          ›
        </Link>
      </header>

      {habits.length === 0 ? (
        <section className="card space-y-3 p-4 sm:p-5">
          <p className="text-sm text-ink-secondary">
            Your routine is empty. Add the things you do on a schedule - skincare on Wednesdays
            and Sundays, Bible study every day - and each day&apos;s list shows up here.
          </p>
          <Link href="/goals/routine" className="btn btn-primary">
            Set up your routine
          </Link>
        </section>
      ) : (
        <TodayChecklist
          key={date}
          date={date}
          habits={due.map((habit) => ({
            id: habit.id,
            name: habit.name,
            schedule: describeSchedule(habit.weekdays),
            done: checks.get(habit.id)?.has(date) ?? false,
          }))}
        />
      )}

      {notToday.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-ink-secondary">
            Not on {date === today ? "today's" : "this day's"} list
          </h2>
          <ul className="card divide-y divide-[var(--border)] text-sm">
            {notToday.map((habit) => (
              <li key={habit.id} className="flex justify-between gap-3 px-4 py-2.5">
                <span>{habit.name}</span>
                <span className="text-ink-muted">{describeSchedule(habit.weekdays)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
