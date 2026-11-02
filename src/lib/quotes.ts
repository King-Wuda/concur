/**
 * Your own quotes and affirmations, one shown a day.
 *
 * The pick is random-looking but decided by the date, so the same one stays
 * up all day - on Home and Today, on the phone and the laptop - instead of
 * changing on every reload. It never repeats yesterday's when there is more
 * than one to choose from.
 */

export type QuoteKind = "quote" | "affirmation";

export type Quote = {
  id: string;
  kind: QuoteKind;
  text: string;
  author: string | null;
};

/**
 * Index of the quote for `date` among `count` quotes, or null if there are none.
 *
 * Days are taken in rounds of `count`. Each round shows every quote once, in
 * an order shuffled from the round number, so each one gets its turn before
 * any comes back - and where one round meets the next, the order is nudged so
 * the last day of a round and the first of the next never match.
 */
export function dailyIndex(count: number, date: string): number | null {
  if (count <= 0) return null;
  if (count === 1) return 0;
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  // With two, alternating is the only order that never repeats.
  if (count === 2) return ((day % 2) + 2) % 2;
  const round = Math.floor(day / count);
  return roundOrder(count, round)[day - round * count];
}

function roundOrder(count: number, round: number): number[] {
  const order = shuffled(count, round);
  const before = shuffled(count, round - 1);
  // Swapping the first two never touches the last, which the next round
  // compares against (count is at least 3 here).
  if (order[0] === before[count - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/** 0..count-1 in an order decided by `seed` (Fisher-Yates on a small PRNG). */
function shuffled(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  let state = (seed ^ 0x9e3779b9) | 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The quote for `date`. Quotes are taken in a stable order (oldest first). */
export function quoteForDay<T extends { id: string }>(quotes: readonly T[], date: string): T | null {
  const index = dailyIndex(quotes.length, date);
  return index === null ? null : quotes[index];
}
