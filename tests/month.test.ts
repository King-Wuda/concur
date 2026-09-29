import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampDateToMonth,
  currentMonthKey,
  dateToMonthKey,
  formatMonthLong,
  formatMonthShort,
  isMonthKey,
  monthKeyToDate,
  normaliseMonthKey,
  shiftMonth,
} from "@/lib/month";

test("month keys round-trip to dates", () => {
  assert.equal(monthKeyToDate("2026-09"), "2026-09-01");
  assert.equal(dateToMonthKey("2026-09-14"), "2026-09");
  assert.equal(dateToMonthKey("2026-09-01T00:00:00Z"), "2026-09");
});

test("month keys validate strictly", () => {
  assert.ok(isMonthKey("2026-01"));
  assert.ok(isMonthKey("2026-12"));
  assert.ok(!isMonthKey("2026-13"));
  assert.ok(!isMonthKey("2026-00"));
  assert.ok(!isMonthKey("2026-1"));
  assert.ok(!isMonthKey("nonsense"));
  assert.equal(normaliseMonthKey("rubbish"), currentMonthKey());
});

test("shiftMonth crosses year boundaries in both directions", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2025-12", 1), "2026-01");
  assert.equal(shiftMonth("2026-06", 7), "2027-01");
  assert.equal(shiftMonth("2026-06", -7), "2025-11");
  assert.equal(shiftMonth("2026-06", 0), "2026-06");
});

test("month names are fixed, not locale data", () => {
  assert.equal(formatMonthLong("2026-09"), "September 2026");
  assert.equal(formatMonthLong("2026-01"), "January 2026");
  assert.equal(formatMonthShort("2026-09"), "Sep 2026");
  assert.equal(formatMonthShort("2026-12"), "Dec 2026");
});

test("a receipt dated outside its month is pulled back into it", () => {
  assert.equal(clampDateToMonth("2026-09-14", "2026-09"), "2026-09-14");
  assert.equal(clampDateToMonth("2026-08-31", "2026-09"), "2026-09-01");
});
