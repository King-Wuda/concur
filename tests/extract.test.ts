import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupportedMimeType, normaliseExtraction } from "@/lib/extract";

/** The model's raw shape, before tidying. */
function raw(overrides: Record<string, unknown> = {}) {
  return {
    store_name: "  Checkers Hyper  ",
    date: "2026-09-14",
    total: 123.456,
    category: "Groceries",
    line_items: [
      { item_name: " Milk 2L ", amount: 32.994, quantity: 1, category: "Groceries" },
    ],
    confidence: "high",
    notes: "   ",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

test("amounts are rounded to cents and text is trimmed", () => {
  const receipt = normaliseExtraction(raw());

  assert.equal(receipt.store_name, "Checkers Hyper");
  assert.equal(receipt.total, 123.46);
  assert.equal(receipt.line_items[0].item_name, "Milk 2L");
  assert.equal(receipt.line_items[0].amount, 32.99);
  assert.equal(receipt.notes, null);
});

test("an unusable category falls back rather than failing", () => {
  const receipt = normaliseExtraction(
    raw({
      category: "Petrol",
      line_items: [{ item_name: "Diesel", amount: 900, quantity: null, category: "fuel" }],
    }),
  );

  assert.equal(receipt.category, "Miscellaneous");
  assert.equal(receipt.line_items[0].category, "Miscellaneous");
});

test("a category in the wrong case is recognised", () => {
  assert.equal(normaliseExtraction(raw({ category: "groceries" })).category, "Groceries");
});

test("a missed total is recovered from the line items", () => {
  const receipt = normaliseExtraction(
    raw({
      total: 0,
      line_items: [
        { item_name: "Rice", amount: 45.5, quantity: null, category: "Groceries" },
        { item_name: "Beans", amount: 22.5, quantity: null, category: "Groceries" },
      ],
    }),
  );

  assert.equal(receipt.total, 68);
});

test("a zero total with no line items stays zero", () => {
  assert.equal(normaliseExtraction(raw({ total: 0, line_items: [] })).total, 0);
});

test("unusable dates become null instead of a wrong guess", () => {
  assert.equal(normaliseExtraction(raw({ date: null })).date, null);
  assert.equal(normaliseExtraction(raw({ date: "14 September" })).date, null);
  assert.equal(normaliseExtraction(raw({ date: "2026-13-40" })).date, null);
  assert.equal(normaliseExtraction(raw({ date: "2026-09-14T08:00:00Z" })).date, "2026-09-14");
});

test("negative discount lines survive normalisation", () => {
  const receipt = normaliseExtraction(
    raw({
      total: 700,
      line_items: [
        { item_name: "Basket", amount: 1000, quantity: null, category: "Groceries" },
        { item_name: "Gift card", amount: -300, quantity: null, category: "Groceries" },
      ],
    }),
  );

  assert.equal(receipt.line_items[1].amount, -300);
  assert.equal(receipt.total, 700);
});

test("blank item names are dropped", () => {
  const receipt = normaliseExtraction(
    raw({
      line_items: [
        { item_name: "   ", amount: 10, quantity: null, category: "Groceries" },
        { item_name: "Bread", amount: 20, quantity: null, category: "Groceries" },
      ],
    }),
  );

  // A blank name becomes "Item" rather than vanishing, so the amount is not lost.
  assert.deepEqual(
    receipt.line_items.map((i) => i.item_name),
    ["Item", "Bread"],
  );
});

test("only the formats Claude can read are accepted", () => {
  assert.ok(isSupportedMimeType("image/jpeg"));
  assert.ok(isSupportedMimeType("application/pdf"));
  assert.ok(!isSupportedMimeType("image/heic"));
  assert.ok(!isSupportedMimeType("text/plain"));
});
