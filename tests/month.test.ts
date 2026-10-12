import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dateToMonthKey,
  formatMonthLong,
  formatMonthShort,
  isIsoDate,
  isMonthKey,
  monthKeyToDate,
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

test("only real calendar dates count as dates", () => {
  // The date now decides which month something is filed under, so a shape-only
  // check would let 2026-13-45 name a month that does not exist.
  assert.ok(isIsoDate("2026-09-14"));
  assert.ok(isIsoDate("2028-02-29")); // a leap day
  assert.ok(!isIsoDate("2026-02-29")); // not a leap year
  assert.ok(!isIsoDate("2026-13-01"));
  assert.ok(!isIsoDate("2026-09-31"));
  assert.ok(!isIsoDate("2026-9-14"));
  assert.ok(!isIsoDate("14/09/2026"));
  assert.ok(!isIsoDate(""));
  assert.ok(!isIsoDate(null));
});
