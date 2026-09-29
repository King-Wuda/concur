import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatRand,
  formatRandCompact,
  formatRandSigned,
  parseRand,
  percentOf,
  round2,
  sum,
} from "@/lib/money";

test("parseRand reads the shapes people actually type", () => {
  assert.equal(parseRand("123.45"), 123.45);
  assert.equal(parseRand("R123.45"), 123.45);
  assert.equal(parseRand("1,234.56"), 1234.56);
  assert.equal(parseRand("1 234,56"), 1234.56);
  assert.equal(parseRand("1.234,56"), 1234.56);
  assert.equal(parseRand("-45"), -45);
  assert.equal(parseRand("R 2 500,00"), 2500);
  assert.equal(parseRand(""), 0);
  assert.equal(parseRand("not money"), 0);
  assert.equal(parseRand(null), 0);
  assert.equal(parseRand(19.999), 20);
});

test("round2 and sum stay cent-accurate", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(sum([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sum([19.99, 5.01, -2.5]), 22.5);
  assert.equal(sum([]), 0);
  assert.equal(round2(Number.NaN), 0);
});

test("signed amounts always carry a sign", () => {
  assert.match(formatRandSigned(120), /^\+/);
  assert.match(formatRandSigned(-80), /^-/);
  assert.ok(!formatRandSigned(0).startsWith("+"));
});

test("percentOf guards against a zero total", () => {
  assert.equal(percentOf(50, 200), 25);
  assert.equal(percentOf(50, 0), 0);
});

test("rand is formatted identically everywhere, not via locale data", () => {
  // Node and the browser disagree about en-ZA, so this must not depend on Intl.
  assert.equal(formatRand(13887.5), "R13\u00a0887.50");
  assert.equal(formatRand(1234567.891), "R1\u00a0234\u00a0567.89");
  assert.equal(formatRand(0), "R0.00");
  assert.equal(formatRand(-80), "-R80.00");
  assert.equal(formatRand(999), "R999.00");
  assert.equal(formatRand(1000), "R1\u00a0000.00");
  assert.equal(formatRandCompact(13887.5), "R13\u00a0888");
  assert.equal(formatRandSigned(120), "+R120.00");
  assert.equal(formatRandSigned(-80), "-R80.00");
  assert.equal(formatRandSigned(0), "R0.00");
});

test("formatted amounts parse back to the same number", () => {
  for (const amount of [0, 1, 999.99, 1000, 13887.5, 1234567.89, -80.25]) {
    assert.equal(parseRand(formatRand(amount)), amount);
  }
});
