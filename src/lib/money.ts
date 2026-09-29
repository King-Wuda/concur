/** Formatting and arithmetic helpers. Everything is South African Rand. */

/**
 * Amounts are formatted by hand rather than through `Intl.NumberFormat`.
 *
 * The ICU data bundled with Node and the data in a browser disagree about
 * en-ZA: one renders R13 887,50 and the other R13,887.50. Since the same
 * component is rendered on the server and hydrated in the browser, that
 * disagreement shows up as a hydration mismatch and React throws the tree away.
 * Formatting explicitly keeps the two identical - and gives us the presentation
 * South African banking apps use: a space between thousands, a full stop before
 * the cents.
 *
 * The thousands separator is a non-breaking space so an amount never wraps in
 * the middle.
 */
const GROUP_SEPARATOR = "\u00a0";

export function formatRand(amount: number): string {
  return format(amount, 2);
}

/** Rounded to whole rand - for axis ticks and tight spaces. */
export function formatRandCompact(amount: number): string {
  return format(amount, 0);
}

/** Always carries an explicit sign, e.g. "+R120.00" / "-R80.00". */
export function formatRandSigned(amount: number): string {
  const rounded = round2(amount);
  if (rounded === 0) return formatRand(0);
  return `${rounded > 0 ? "+" : "-"}${formatRand(Math.abs(rounded))}`;
}

function format(amount: number, decimals: 0 | 2): string {
  const rounded = round2(amount);
  const fixed = Math.abs(rounded).toFixed(decimals);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  return `${rounded < 0 ? "-" : ""}R${grouped}${cents ? `.${cents}` : ""}`;
}

/** Cent-accurate rounding, avoiding the usual float drift on sums. */
export function round2(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function sum(amounts: readonly number[]): number {
  return round2(amounts.reduce((total, amount) => total + (Number(amount) || 0), 0));
}

/**
 * Parses money the way a person types it: "1 234,56", "R1,234.56", "-45".
 * Returns 0 for anything unparseable so a stray keystroke can't poison a total.
 */
export function parseRand(input: unknown): number {
  if (typeof input === "number") return round2(input);
  if (typeof input !== "string") return 0;

  let text = input.trim().replace(/[Rr\s\u00a0]/g, "");
  if (!text) return 0;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma > lastDot) {
    // Comma is the decimal separator: "1.234,56"
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    // Dot is the decimal separator (or there is none): "1,234.56"
    text = text.replace(/,/g, "");
  }

  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? round2(value) : 0;
}

/** Percentage of `total`, clamped to 0 when there is nothing to divide by. */
export function percentOf(part: number, total: number): number {
  if (!total) return 0;
  return round2((part / total) * 100);
}
