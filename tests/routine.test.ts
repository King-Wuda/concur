import assert from "node:assert/strict";
import { test } from "node:test";

import { averageSteps, formatSteps, weeklyChange, withWeightAverage } from "@/lib/body";
import {
  consistencyOf,
  deadlineStatus,
  describeDeadline,
  describeSchedule,
  formatDay,
  isDue,
  milestoneProgress,
  recentDays,
  reorder,
  weekdayOf,
} from "@/lib/routine";

// 4 November 2026 is a Wednesday.
const WED = "2026-11-04";
const SUN = 0;
const WEDNESDAY = 3;
const SATURDAY = 6;

const skincare = { weekdays: [WEDNESDAY, SUN], created: "2026-10-01" };
const bible = { weekdays: [0, 1, 2, 3, 4, 5, 6], created: "2026-10-01" };
const laundry = { weekdays: [SATURDAY], created: "2026-10-01" };

test("weekdays come out right", () => {
  assert.equal(weekdayOf(WED), WEDNESDAY);
  assert.equal(weekdayOf("2026-11-01"), SUN);
  assert.equal(formatDay(WED), "Wednesday 4 November");
});

test("on a Wednesday the list is skincare and Bible study, not laundry", () => {
  const due = [
    ["Skincare", skincare],
    ["Bible study", bible],
    ["Laundry", laundry],
  ].filter(([, habit]) => isDue(habit as typeof skincare, WED));
  assert.deepEqual(
    due.map(([name]) => name),
    ["Skincare", "Bible study"],
  );
  assert.equal(isDue(laundry, "2026-11-07"), true);
});

test("schedules read the way you would say them", () => {
  assert.equal(describeSchedule([3, 0]), "Wed & Sun");
  assert.equal(describeSchedule([0, 1, 2, 3, 4, 5, 6]), "Every day");
  assert.equal(describeSchedule([6]), "Every Saturday");
  assert.equal(describeSchedule([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(describeSchedule([0, 6]), "Weekends");
  assert.equal(describeSchedule([1, 3, 5]), "Mon, Wed & Fri");
});

test("consistency counts scheduled days only, and today only once it is done", () => {
  // Skincare from Sun 25 Oct to Wed 4 Nov: due 25 Oct, 28 Oct, 1 Nov, 4 Nov.
  const habit = { ...skincare, created: "2026-10-25" };
  const ticked = new Set(["2026-10-25", "2026-10-28", "2026-11-01"]);

  // Wednesday morning, not done yet: three due so far, all three done.
  assert.deepEqual(consistencyOf(habit, ticked, WED), { due: 3, done: 3, streak: 3 });

  // Ticked tonight: four of four, streak of four.
  ticked.add(WED);
  assert.deepEqual(consistencyOf(habit, ticked, WED), { due: 4, done: 4, streak: 4 });
});

test("a missed day breaks the streak but not the history", () => {
  const habit = { ...skincare, created: "2026-10-25" };
  // Missed Wed 28 Oct.
  const ticked = new Set(["2026-10-25", "2026-11-01"]);
  assert.deepEqual(consistencyOf(habit, ticked, WED), { due: 3, done: 2, streak: 1 });
});

test("a brand new habit starts with a clean slate", () => {
  const habit = { weekdays: [0, 1, 2, 3, 4, 5, 6], created: WED };
  assert.deepEqual(consistencyOf(habit, new Set(), WED), { due: 0, done: 0, streak: 0 });
});

test("the dots under a habit show its last scheduled days", () => {
  const habit = { ...skincare, created: "2026-10-25" };
  const ticked = new Set(["2026-10-25", "2026-11-01"]);
  assert.deepEqual(
    recentDays(habit, ticked, WED).map((d) => `${d.date}:${d.state}`),
    ["2026-10-25:done", "2026-10-28:missed", "2026-11-01:done", "2026-11-04:today"],
  );
});

test("deadlines say how long is left, or that there is none", () => {
  assert.equal(describeDeadline(deadlineStatus(null, WED)), "Open-ended");
  assert.equal(describeDeadline(deadlineStatus(WED, WED)), "Due today");
  assert.equal(describeDeadline(deadlineStatus("2026-11-07", WED)), "3 days left");
  assert.equal(describeDeadline(deadlineStatus("2026-12-02", WED)), "4 weeks left");
  assert.equal(describeDeadline(deadlineStatus("2027-06-01", WED)), "7 months left");
  assert.equal(describeDeadline(deadlineStatus("2026-11-01", WED)), "Overdue by 3 days");
});

test("milestones give the goal its progress", () => {
  assert.deepEqual(milestoneProgress([]), { done: 0, total: 0, percent: 0 });
  assert.deepEqual(
    milestoneProgress([{ done_at: "x" }, { done_at: null }, { done_at: "y" }]),
    { done: 2, total: 3, percent: 67 },
  );
});

test("moving a goal up or down changes only its place", () => {
  const goals = ["House", "Licence", "Half marathon"];
  assert.deepEqual(reorder(goals, 2, -1), ["House", "Half marathon", "Licence"]);
  assert.deepEqual(reorder(goals, 0, 1), ["Licence", "House", "Half marathon"]);
  // Off either end: nothing moves.
  assert.deepEqual(reorder(goals, 0, -1), goals);
  assert.deepEqual(reorder(goals, 2, 1), goals);
});

test("the weight average smooths day-to-day swings over 7 days", () => {
  const logs = [
    { date: "2026-11-01", weight_kg: 82, steps: 8000 },
    { date: "2026-11-02", weight_kg: 83, steps: null },
    { date: "2026-11-03", weight_kg: null, steps: 12000 },
    { date: "2026-11-04", weight_kg: 81, steps: 10000 },
  ];
  const result = withWeightAverage(logs);
  assert.deepEqual(
    result.map((r) => r.weight_avg),
    [82, 82.5, 82.5, 82],
  );
  assert.equal(averageSteps(logs, WED), 10000);
  assert.equal(formatSteps(12500), "12 500");
});

test("week on week change compares the two 7-day averages", () => {
  const logs = [
    { date: "2026-10-23", weight_kg: 84, steps: null },
    { date: "2026-10-27", weight_kg: 83, steps: null },
    { date: "2026-11-01", weight_kg: 82.5, steps: null },
    { date: "2026-11-04", weight_kg: 81.9, steps: null },
  ];
  // This week (29 Oct - 4 Nov): 82.2. Last week (22 - 28 Oct): 83.5.
  assert.equal(weeklyChange(logs, WED), -1.3);
  assert.equal(weeklyChange([], WED), null);
});

test("one quote a day: the same all day, never yesterday's, and all get a turn", async () => {
  const { dailyIndex, quoteForDay } = await import("@/lib/quotes");
  assert.equal(dailyIndex(0, WED), null);
  assert.equal(dailyIndex(1, WED), 0);
  assert.equal(quoteForDay([], WED), null);

  // Stable within a day.
  assert.equal(dailyIndex(5, WED), dailyIndex(5, WED));

  // Over a year: no day repeats the one before, and every quote shows up.
  for (const count of [2, 3, 5, 12]) {
    const seen = new Set<number>();
    let previous: number | null = null;
    let day = "2026-11-01";
    for (let i = 0; i < 365; i += 1) {
      const index = dailyIndex(count, day)!;
      assert.ok(index >= 0 && index < count);
      assert.notEqual(index, previous, `${day} repeated yesterday's quote (${count} quotes)`);
      seen.add(index);
      previous = index;
      const [y, m, d] = day.split("-").map(Number);
      day = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    assert.equal(seen.size, count);
  }
});

test("the day's routine runs in time order, untimed things last", async () => {
  const { byTime, formatTimeRange, shortTime } = await import("@/lib/routine");
  const items = [
    { name: "Bible study", start_time: "21:00:00", position: 0 },
    { name: "Cooking", start_time: null, position: 1 },
    { name: "Gym", start_time: "05:00:00", position: 2 },
    { name: "Room upkeep", start_time: "06:00", position: 3 },
    { name: "Laundry", start_time: null, position: 4 },
  ];
  assert.deepEqual(
    byTime(items).map((i) => i.name),
    ["Gym", "Room upkeep", "Bible study", "Cooking", "Laundry"],
  );
  assert.equal(formatTimeRange("05:00:00", "07:00:00"), "05:00–07:00");
  assert.equal(formatTimeRange("07:00", null), "07:00");
  assert.equal(formatTimeRange(null, null), null);
  assert.equal(shortTime("21:30:00"), "21:30");
});

test("focus blocks show their dates", async () => {
  const { formatDateSpan } = await import("@/lib/routine");
  assert.equal(formatDateSpan("2026-10-15", "2026-10-16"), "15 Oct – 16 Oct 2026");
  assert.equal(formatDateSpan("2026-12-28", "2027-01-04"), "28 Dec 2026 – 4 Jan 2027");
  assert.equal(formatDateSpan(null, "2026-11-08"), "by 8 Nov 2026");
  assert.equal(formatDateSpan(null, null), null);
});

test("the step streak counts days at or over the goal", async () => {
  const { stepStreak, stepGoalHits } = await import("@/lib/body");
  const logs = [
    { date: "2026-10-31", weight_kg: null, steps: 12000 },
    { date: "2026-11-01", weight_kg: null, steps: 9000 },
    { date: "2026-11-02", weight_kg: null, steps: 10000 },
    { date: "2026-11-03", weight_kg: null, steps: 11000 },
  ];
  // Tonight not logged yet: the streak runs up to yesterday.
  assert.equal(stepStreak(logs.slice(0, 3), 10000, WED), 0);
  assert.equal(stepStreak(logs, 10000, WED), 2);
  assert.equal(stepStreak(logs, 10000, "2026-11-03"), 2);
  assert.deepEqual(stepGoalHits(logs, 10000, "2026-11-03"), { hit: 3, logged: 4 });
});
