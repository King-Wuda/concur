import { round2, sum } from "@/lib/money";

/**
 * Trips and events: an expense report per occasion, shared between the
 * people on it.
 *
 * Everything is split equally between all participants - you included - and
 * the settle-up says who pays whom so that everyone ends up having paid their
 * equal share, in as few payments as the greedy match manages.
 */

export const EVENT_CATEGORIES = [
  "Accommodation",
  "Transport",
  "Food",
  "Activities",
  "Other",
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export function isEventCategory(value: unknown): value is EventCategory {
  return typeof value === "string" && (EVENT_CATEGORIES as readonly string[]).includes(value);
}

/** A first guess at the trip category from the monthly one. */
export function guessEventCategory(monthlyCategory: string): EventCategory {
  if (monthlyCategory === "Transport") return "Transport";
  if (monthlyCategory === "Groceries" || monthlyCategory === "Chill") return "Food";
  return "Other";
}

export type Participant = { id: string; name: string; is_me: boolean };

export type EventExpense = {
  total: number;
  /** Participant id, or null for you (receipts saved before an event had participants). */
  paid_by: string | null;
  event_category: string | null;
};

export type CategoryLine = {
  category: EventCategory;
  budgeted: number;
  spent: number;
  isOver: boolean;
};

export type PersonLine = {
  participant: Participant;
  paid: number;
  /** Their equal share of everything spent. */
  share: number;
  /** paid - share: positive means they are owed, negative that they owe. */
  balance: number;
};

export type Settlement = { from: Participant; to: Participant; amount: number };

export type EventSummary = {
  spent: number;
  budget: number;
  remaining: number;
  isOver: boolean;
  categories: CategoryLine[];
  people: PersonLine[];
  settlements: Settlement[];
};

export function summariseEvent(
  budget: number,
  categoryBudgets: Partial<Record<EventCategory, number>>,
  participants: readonly Participant[],
  expenses: readonly EventExpense[],
): EventSummary {
  const spent = sum(expenses.map((e) => Number(e.total) || 0));

  const categories = EVENT_CATEGORIES.map((category) => {
    const categorySpent = sum(
      expenses
        .filter((e) => (isEventCategory(e.event_category) ? e.event_category : "Other") === category)
        .map((e) => Number(e.total) || 0),
    );
    const budgeted = round2(categoryBudgets[category] ?? 0);
    return {
      category,
      budgeted,
      spent: categorySpent,
      isOver: budgeted > 0 && categorySpent > budgeted,
    };
  });

  const me = participants.find((p) => p.is_me);
  const paidBy = (expense: EventExpense) => expense.paid_by ?? me?.id ?? null;
  // Shares in whole cents, so they add back up to exactly what was spent: the
  // cents left over when it does not divide evenly go one each to the first
  // people on the list.
  const spentCents = Math.round(spent * 100);
  const n = participants.length;
  const shareCents = (index: number) =>
    n === 0 ? 0 : Math.floor(spentCents / n) + (index < spentCents % n ? 1 : 0);

  const people = participants.map((participant, index) => {
    const paid = sum(
      expenses.filter((e) => paidBy(e) === participant.id).map((e) => Number(e.total) || 0),
    );
    const share = shareCents(index) / 100;
    return {
      participant,
      paid,
      share,
      balance: round2(paid - share),
    };
  });

  return {
    spent,
    budget: round2(budget),
    remaining: round2(budget - spent),
    isOver: budget > 0 && spent > budget,
    categories,
    people,
    settlements: settleUp(people),
  };
}

/**
 * Who pays whom. The biggest debtor pays the biggest creditor as much as
 * they can, and so on until everyone is square to the cent.
 */
export function settleUp(people: readonly PersonLine[]): Settlement[] {
  // Work in cents so nothing drifts.
  const owes = people
    .filter((p) => p.balance < -0.004)
    .map((p) => ({ who: p.participant, cents: Math.round(-p.balance * 100) }))
    .sort((a, b) => b.cents - a.cents);
  const owed = people
    .filter((p) => p.balance > 0.004)
    .map((p) => ({ who: p.participant, cents: Math.round(p.balance * 100) }))
    .sort((a, b) => b.cents - a.cents);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const cents = Math.min(owes[i].cents, owed[j].cents);
    if (cents > 0) {
      settlements.push({ from: owes[i].who, to: owed[j].who, amount: cents / 100 });
    }
    owes[i].cents -= cents;
    owed[j].cents -= cents;
    if (owes[i].cents <= 0) i += 1;
    if (owed[j].cents <= 0) j += 1;
  }
  return settlements;
}
