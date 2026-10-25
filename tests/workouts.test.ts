import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_PLAN,
  exerciseKey,
  formatSet,
  nextDayCode,
  progressFor,
  targetFor,
  type LoggedSet,
} from "@/lib/workouts";

test("reverse pyramid sets aim 4-6, then 6-8, then 8-10", () => {
  assert.equal(targetFor("RPT", 1).label, "4-6");
  assert.equal(targetFor("RPT", 2).label, "6-8");
  assert.equal(targetFor("RPT", 3).label, "8-10");
});

test("rest-pause opens with 10-15 and then sets of 4-6", () => {
  assert.equal(targetFor("RP", 1).label, "10-15");
  for (const set of [2, 3, 4, 5]) assert.equal(targetFor("RP", set).label, "4-6");
});

test("the seeded plan matches the spreadsheet", () => {
  assert.deepEqual(
    DEFAULT_PLAN.map((day) => [day.code, day.exercises.length]),
    [
      ["A", 6],
      ["B", 8],
      ["C", 7],
    ],
  );
  const b = DEFAULT_PLAN[1].exercises;
  assert.deepEqual(b[0], { name: "Squat", scheme: "RPT", sets: 2 });
  assert.deepEqual(b[3], { name: "Weighted dips", scheme: "RPT", sets: 3 });
  const flies = DEFAULT_PLAN[2].exercises.find((e) => e.name === "Chest flies");
  assert.deepEqual(flies, { name: "Chest flies", scheme: "RP", sets: 3 });
});

test("the rotation goes A, B, C and back to A", () => {
  const codes = ["A", "B", "C"];
  assert.equal(nextDayCode(codes, null), "A");
  assert.equal(nextDayCode(codes, "A"), "B");
  assert.equal(nextDayCode(codes, "B"), "C");
  assert.equal(nextDayCode(codes, "C"), "A");
  // A day since removed from the plan starts the rotation over.
  assert.equal(nextDayCode(codes, "D"), "A");
  assert.equal(nextDayCode([], "A"), null);
});

const set = (set_number: number, target: string, reps: number, weight_kg = 60): LoggedSet => ({
  set_number,
  target,
  reps,
  weight_kg,
});

test("go heavier only once every set reached the top of its range", () => {
  assert.deepEqual(progressFor("RPT", 3, []), { kind: "new" });
  assert.deepEqual(
    progressFor("RPT", 3, [set(1, "4-6", 6), set(2, "6-8", 8), set(3, "8-10", 10)]),
    { kind: "increase" },
  );
  assert.deepEqual(
    progressFor("RPT", 3, [set(1, "4-6", 6), set(2, "6-8", 7), set(3, "8-10", 10)]),
    { kind: "hold", short: [2] },
  );
  // Beating the range counts as reaching it.
  assert.deepEqual(progressFor("RP", 2, [set(1, "10-15", 16), set(2, "4-6", 6)]), {
    kind: "increase",
  });
});

test("a skipped set means not ready yet", () => {
  assert.deepEqual(progressFor("RPT", 3, [set(1, "4-6", 6), set(2, "6-8", 8)]), {
    kind: "hold",
    short: [3],
  });
});

test("sets are judged against the target they had on the day", () => {
  // Logged when the plan said 8-12 for the first set; 12 was the top then.
  assert.deepEqual(progressFor("RP", 1, [set(1, "8-12", 12)]), { kind: "increase" });
});

test("sets read the way they are written in a gym notebook", () => {
  assert.equal(formatSet({ weight_kg: 60, reps: 6 }), "60 kg × 6");
  assert.equal(formatSet({ weight_kg: 22.5, reps: 12 }), "22.5 kg × 12");
  assert.equal(formatSet({ weight_kg: null, reps: 10 }), "× 10");
});

test("the same exercise on different days shares one history", () => {
  assert.equal(exerciseKey("Lateral raises"), exerciseKey("  lateral   Raises "));
});

test("last time comes from the most recent session that had the exercise", async () => {
  const { lastTimes } = await import("@/lib/workout-data");
  const s = (id: string, date: string, sets: [string, number, number, number][]) => ({
    id,
    day_id: null,
    day_code: "A",
    day_name: "Workout A",
    date,
    notes: null,
    created_at: `${date}T10:00:00Z`,
    sets: sets.map(([exercise_name, set_number, weight_kg, reps], position) => ({
      id: `${id}-${position}`,
      session_id: id,
      exercise_name,
      scheme: "RPT" as const,
      set_number,
      target: "4-6",
      weight_kg,
      reps,
      position,
    })),
  });
  // Newest first, as listSessions returns them.
  const result = lastTimes([
    s("c", "2026-10-24", [["Lateral raises", 1, 10, 15]]),
    s("a", "2026-10-20", [
      ["Incline bench", 2, 55, 8],
      ["Incline bench", 1, 60, 6],
      ["Lateral raises", 1, 8, 15],
    ]),
  ]);
  assert.equal(result["lateral raises"].date, "2026-10-24");
  assert.equal(result["lateral raises"].sets[0].weight_kg, 10);
  assert.deepEqual(
    result["incline bench"].sets.map((set) => set.set_number),
    [1, 2],
  );
});
