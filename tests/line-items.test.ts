import assert from "node:assert/strict";
import { test } from "node:test";

import {
  draftLine,
  lineTotal,
  linesPayload,
  linesTotal,
  withBalancingLine,
  type DraftLineItem,
} from "@/components/LineItemEditor";

const line = (item_name: string, price: string, quantity = ""): DraftLineItem => ({
  key: item_name,
  item_name,
  price,
  quantity,
  category: "Groceries",
});

test("two lines of 56 and 28 make a total of 84", () => {
  assert.equal(linesTotal([line("Bread", "56"), line("Milk", "28")]), 84);
});

test("raising the quantity raises the line and the total", () => {
  const milk = line("Milk", "28");
  assert.equal(lineTotal(milk), 28);
  assert.equal(lineTotal({ ...milk, quantity: "3" }), 84);
  assert.equal(linesTotal([line("Bread", "56"), { ...milk, quantity: "3" }]), 140);
  // A blank or nonsense quantity is one.
  assert.equal(lineTotal({ ...milk, quantity: "" }), 28);
  assert.equal(lineTotal({ ...milk, quantity: "abc" }), 28);
  // Prices with cents, and "R 12,50" as typed.
  assert.equal(lineTotal(line("Gum", "12,50", "2")), 25);
});

test("a saved line opens as price of one times quantity, and saves back the same", () => {
  const draft = draftLine(
    { item_name: "Eggs", amount: 89.97, quantity: 3, category: "Groceries" },
    "k",
  );
  assert.equal(draft.price, "29.99");
  assert.equal(draft.quantity, "3");
  assert.deepEqual(linesPayload([draft]), [
    { item_name: "Eggs", amount: 89.97, quantity: 3, category: "Groceries" },
  ]);
  // An amount that does not divide to the cent still comes back exactly.
  const odd = draftLine({ item_name: "X", amount: 10, quantity: 3, category: "Groceries" }, "o");
  assert.equal(linesPayload([odd])[0].amount, 10);
  // Quantity one is stored as none, as before.
  const single = draftLine({ item_name: "Y", amount: 5, quantity: null, category: "Groceries" }, "s");
  assert.equal(single.quantity, "");
  assert.equal(linesPayload([single])[0].quantity, null);
});

test("a scanned slip whose lines fall short keeps its printed total", () => {
  const items = withBalancingLine([line("Bread", "56"), line("Milk", "28")], 96.6, "Groceries");
  assert.equal(items.length, 3);
  assert.equal(items[2].item_name, "Unlisted / VAT / rounding");
  assert.equal(linesTotal(items), 96.6);
  // Lines that already add up are left alone; so is a receipt with no lines.
  assert.equal(withBalancingLine([line("A", "84")], 84, "Groceries").length, 1);
  assert.equal(withBalancingLine([], 50, "Groceries").length, 0);
  // Over the total: the gap is a discount.
  const over = withBalancingLine([line("A", "100")], 90, "Groceries");
  assert.equal(over[1].item_name, "Discount");
  assert.equal(linesTotal(over), 90);
});
