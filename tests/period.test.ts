import assert from "node:assert/strict";
import { test } from "node:test";

import {
  budgetMonthFor,
  defaultDateIn,
  formatPeriod,
  paydayFor,
  paydayProblem,
  periodFor,
  todayInSouthAfrica,
  type MonthStart,
} from "@/lib/period";

const none: MonthStart[] = [];

test("October's budget runs from payday on 24 September to 23 October", () => {
  assert.deepEqual(periodFor("2026-10", none), { start: "2026-09-24", end: "2026-10-23" });
  assert.equal(formatPeriod(periodFor("2026-10", none)), "24 Sep – 23 Oct");
});

test("spending after payday belongs to the next month's budget", () => {
  // The real September receipts that started this: filed under October.
  assert.equal(budgetMonthFor("2026-09-29", none), "2026-10");
  assert.equal(budgetMonthFor("2026-09-30", none), "2026-10");
  // Payday itself opens the new month.
  assert.equal(budgetMonthFor("2026-09-24", none), "2026-10");
  // The day before payday is still the old one.
  assert.equal(budgetMonthFor("2026-09-23", none), "2026-09");
  assert.equal(budgetMonthFor("2026-09-14", none), "2026-09");
  assert.equal(budgetMonthFor("2026-10-23", none), "2026-10");
  assert.equal(budgetMonthFor("2026-10-24", none), "2026-11");
});

test("the budget year turns over on the December payday", () => {
  assert.equal(budgetMonthFor("2026-12-24", none), "2027-01");
  assert.equal(budgetMonthFor("2026-12-31", none), "2027-01");
  assert.equal(budgetMonthFor("2027-01-10", none), "2027-01");
  assert.deepEqual(periodFor("2027-01", none), { start: "2026-12-24", end: "2027-01-23" });
  assert.equal(formatPeriod(periodFor("2027-01", none)), "24 Dec 2026 – 23 Jan 2027");
});

test("an early payday moves the boundary for that month only", () => {
  // 24 October 2026 is a Saturday: paid on Friday the 23rd instead.
  const starts: MonthStart[] = [{ month: "2026-11", periodStart: "2026-10-23" }];

  assert.equal(budgetMonthFor("2026-10-23", starts), "2026-11");
  assert.equal(budgetMonthFor("2026-10-22", starts), "2026-10");
  assert.deepEqual(periodFor("2026-10", starts), { start: "2026-09-24", end: "2026-10-22" });
  assert.deepEqual(periodFor("2026-11", starts), { start: "2026-10-23", end: "2026-11-23" });

  // And December is back to the usual 24th - a one-off is not carried forward.
  assert.equal(paydayFor("2026-12", starts), "2026-11-24");
});

test("every day belongs to exactly one budget month", () => {
  const starts: MonthStart[] = [
    { month: "2026-11", periodStart: "2026-10-23" },
    { month: "2027-03", periodStart: "2027-02-20" },
  ];
  // Walk a year and a half of days: each must sit inside the period of the
  // month it is filed under - no gaps between months, no overlaps.
  const day = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 550; i += 1) {
    const iso = day.toISOString().slice(0, 10);
    const key = budgetMonthFor(iso, starts);
    const { start, end } = periodFor(key, starts);
    assert.ok(start <= iso && iso <= end, `${iso} filed under ${key} (${start}..${end})`);
    day.setUTCDate(day.getUTCDate() + 1);
  }
});

test("a short month still has a payday", () => {
  // Nothing is paid on the 30th of February.
  const starts: MonthStart[] = [{ month: "2026-04", periodStart: "2026-03-31" }];
  assert.equal(periodFor("2026-03", starts).end, "2026-03-30");
  assert.equal(paydayFor("2026-03", none), "2026-02-24");
});

test("a new entry defaults to today while its month is running", () => {
  assert.equal(defaultDateIn("2026-10", none, "2026-10-12"), "2026-10-12");
  assert.equal(defaultDateIn("2026-10", none, "2026-09-26"), "2026-09-26");
  // Catching up on a month that has ended: its last day, not the 1st.
  assert.equal(defaultDateIn("2026-09", none, "2026-10-12"), "2026-09-23");
  // Planning ahead: the day that month starts.
  assert.equal(defaultDateIn("2026-11", none, "2026-10-12"), "2026-10-24");
});

test("today is South African today, whatever the server's clock says", () => {
  // 23:30 UTC on the 23rd is already 01:30 on payday in Johannesburg.
  assert.equal(todayInSouthAfrica(new Date("2026-10-23T23:30:00Z")), "2026-10-24");
  assert.equal(todayInSouthAfrica(new Date("2026-10-23T21:59:00Z")), "2026-10-23");
});

test("a payday has to sit between its neighbours", () => {
  assert.equal(paydayProblem("2026-11", "2026-10-23", none), null);
  assert.equal(paydayProblem("2026-11", "2026-11-02", none), null); // paid late
  assert.match(paydayProblem("2026-11", "2026-09-30", none)!, /month before it/);
  assert.match(paydayProblem("2026-11", "2026-12-01", none)!, /month before it/);
  // October's own payday is 24 September, so November cannot start before it.
  assert.match(
    paydayProblem("2026-10", "2026-09-24", [{ month: "2026-09", periodStart: "2026-09-24" }])!,
    /previous month/,
  );
  assert.match(paydayProblem("2026-11", "2026-11-24", none)!, /next month/);
});
