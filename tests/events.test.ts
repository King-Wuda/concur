import assert from "node:assert/strict";
import { test } from "node:test";

import { guessEventCategory, settleUp, summariseEvent, type Participant } from "@/lib/events";

const you: Participant = { id: "me", name: "You", is_me: true };
const thabo: Participant = { id: "t", name: "Thabo", is_me: false };
const lerato: Participant = { id: "l", name: "Lerato", is_me: false };

test("spend is tracked against the trip budget and each category's", () => {
  const s = summariseEvent(8000, { Accommodation: 4000, Food: 1500 }, [you, thabo], [
    { total: 3600, paid_by: "t", event_category: "Accommodation" },
    { total: 1200, paid_by: "me", event_category: "Food" },
    { total: 650, paid_by: "me", event_category: "Food" },
    { total: 400, paid_by: "me", event_category: null },
  ]);
  assert.equal(s.spent, 5850);
  assert.equal(s.remaining, 2150);
  assert.equal(s.isOver, false);
  const food = s.categories.find((c) => c.category === "Food")!;
  assert.deepEqual([food.budgeted, food.spent, food.isOver], [1500, 1850, true]);
  // No trip category counts as Other.
  assert.equal(s.categories.find((c) => c.category === "Other")!.spent, 400);
});

test("how much you covered and how much each person covered", () => {
  const s = summariseEvent(0, {}, [you, thabo, lerato], [
    { total: 3600, paid_by: "t", event_category: "Accommodation" },
    { total: 900, paid_by: "me", event_category: "Food" },
    { total: 0, paid_by: "l", event_category: "Food" },
  ]);
  const paid = Object.fromEntries(s.people.map((p) => [p.participant.name, p.paid]));
  assert.deepEqual(paid, { You: 900, Thabo: 3600, Lerato: 0 });
  // R4 500 split three ways: R1 500 each.
  assert.ok(s.people.every((p) => p.share === 1500));
});

test("settle-up: everyone ends up paying an equal share", () => {
  const s = summariseEvent(0, {}, [you, thabo, lerato], [
    { total: 3600, paid_by: "t", event_category: "Accommodation" },
    { total: 900, paid_by: "me", event_category: "Food" },
  ]);
  const lines = s.settlements.map((x) => `${x.from.name}->${x.to.name}:${x.amount}`);
  // Lerato paid nothing and owes R1 500; you paid R900 and owe R600; both to Thabo.
  assert.deepEqual(lines.sort(), ["Lerato->Thabo:1500", "You->Thabo:600"]);
});

test("a receipt with no payer recorded counts as yours", () => {
  const s = summariseEvent(0, {}, [you, thabo], [{ total: 200, paid_by: null, event_category: "Food" }]);
  assert.equal(s.people.find((p) => p.participant.is_me)!.paid, 200);
  assert.deepEqual(
    s.settlements.map((x) => `${x.from.name}->${x.to.name}:${x.amount}`),
    ["Thabo->You:100"],
  );
});

test("an amount that does not split evenly still settles to the cent", () => {
  const s = summariseEvent(0, {}, [you, thabo, lerato], [
    { total: 100, paid_by: "me", event_category: "Food" },
  ]);
  // Shares of 33.34 + 33.33 + 33.33 add back to exactly R100.
  assert.equal(
    Math.round(s.people.reduce((acc, p) => acc + p.share, 0) * 100),
    10000,
  );
  // After paying what the settle-up says, everyone has paid exactly their share.
  for (const person of s.people) {
    const out = s.settlements.filter((x) => x.from.id === person.participant.id);
    const back = s.settlements.filter((x) => x.to.id === person.participant.id);
    const net =
      person.paid +
      out.reduce((a, x) => a + x.amount, 0) -
      back.reduce((a, x) => a + x.amount, 0);
    assert.equal(Math.round(net * 100), Math.round(person.share * 100), person.participant.name);
  }
  assert.equal(settleUp([]).length, 0);
});

test("on your own, nobody owes anybody", () => {
  const s = summariseEvent(5000, {}, [you], [{ total: 1234, paid_by: "me", event_category: "Food" }]);
  assert.deepEqual(s.settlements, []);
});

test("trip category guessed from the monthly one", () => {
  assert.equal(guessEventCategory("Transport"), "Transport");
  assert.equal(guessEventCategory("Groceries"), "Food");
  assert.equal(guessEventCategory("Chill"), "Food");
  assert.equal(guessEventCategory("Lily"), "Other");
});

test("money sent ahead lets you pay for others and still only put in your share", () => {
  // You pay the R3 000 Airbnb for two; Thabo had sent you R1 500 for his half.
  const s = summariseEvent(
    0,
    {},
    [you, thabo],
    [{ total: 3000, paid_by: "me", event_category: "Accommodation" }],
    [{ from: "t", to: "me", amount: 1500 }],
  );
  const mine = s.people.find((p) => p.participant.is_me)!;
  assert.deepEqual([mine.paid, mine.received, mine.share, mine.balance], [3000, 1500, 1500, 0]);
  assert.deepEqual(s.settlements, []);
});

test("a part payment leaves the rest in the settle-up", () => {
  const s = summariseEvent(
    0,
    {},
    [you, thabo],
    [{ total: 3000, paid_by: "me", event_category: "Accommodation" }],
    [{ from: "t", to: "me", amount: 1000 }],
  );
  assert.deepEqual(
    s.settlements.map((x) => `${x.from.name}->${x.to.name}:${x.amount}`),
    ["Thabo->You:500"],
  );
});

test("money between two others counts too, and can overshoot", () => {
  // Thabo paid R900 for three; Lerato sent Thabo R600 - R300 too much.
  const s = summariseEvent(
    0,
    {},
    [you, thabo, lerato],
    [{ total: 900, paid_by: "t", event_category: "Food" }],
    [{ from: "l", to: "t", amount: 600 }],
  );
  const lines = s.settlements.map((x) => `${x.from.name}->${x.to.name}:${x.amount}`).sort();
  // You owe your R300 share; Thabo has R300 of Lerato's too many, so you pay Lerato.
  assert.deepEqual(lines, ["You->Lerato:300"]);
});
