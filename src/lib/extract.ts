import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod";

import { CATEGORIES, toCategory } from "@/lib/categories";
import { round2, sum } from "@/lib/money";
import type { ExtractedReceipt } from "@/lib/types";

/**
 * Reads a receipt photo or PDF with Claude and returns a structured draft the
 * user can review. Nothing here writes to the database - the draft is only a
 * proposal until the user confirms it in the review screen.
 */

const MODEL = "claude-opus-5-5";

export const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const SUPPORTED_MIME_TYPES = [...SUPPORTED_IMAGE_TYPES, "application/pdf"] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export function isSupportedMimeType(value: string): value is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(value);
}

/** Thrown when the model declines the request or returns nothing usable. */
export class ExtractionError extends Error {}

const LineItemSchema = z.object({
  item_name: z
    .string()
    .describe("The item exactly as printed on the receipt, tidied of OCR noise."),
  amount: z
    .number()
    .describe(
      "Amount actually paid for this line in rand, after any per-item discount. " +
        "Discount, voucher and gift-card lines are negative.",
    ),
  quantity: z
    .number()
    .nullable()
    .describe("Quantity or weight if the receipt shows one, otherwise null."),
  category: z
    .enum(CATEGORIES)
    .describe("Category for this individual line, usually the same as the receipt category."),
});

const ReceiptSchema = z.object({
  store_name: z
    .string()
    .describe(
      "Merchant or store name. For a ride-hailing or delivery screenshot use the " +
        "underlying merchant where it is shown, e.g. 'Uber Eats - KFC'.",
    ),
  date: z
    .string()
    .nullable()
    .describe("Purchase date as YYYY-MM-DD, or null if the receipt does not show one."),
  total: z
    .number()
    .describe(
      "Total actually paid out of pocket in rand, after discounts, vouchers and " +
        "gift cards have been deducted. Never the pre-discount retail total.",
    ),
  category: z.enum(CATEGORIES).describe("Best category for the receipt as a whole."),
  line_items: z
    .array(LineItemSchema)
    .describe(
      "Every individual purchased line on the receipt. Never a summary row: no " +
        "subtotal, VAT, total, rounding, tender, change or loyalty-points lines.",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How confident you are in the numbers, given image quality."),
  notes: z
    .string()
    .nullable()
    .describe(
      "One short sentence for the user only if something needs their attention " +
        "(unreadable line, missing total, split payment). Otherwise null.",
    ),
});

const SYSTEM_PROMPT = `You read South African till slips, invoices, and payment
screenshots and turn them into structured data for a personal monthly budget.

All amounts are South African Rand (ZAR). Return plain numbers with no currency
symbol, no thousands separators, and a full stop as the decimal separator.

Capture every individual purchased line item with its own name and amount. Do
not collapse items together, and do not stop at the total. Exclude summary rows
- subtotal, VAT/tax, total, rounding, change, tender/card lines, loyalty points
and balance carried forward are not line items.

Amounts are what came out of pocket:
- Apply discounts, specials, vouchers and gift cards. If a gift card or voucher
  covered part of the purchase, the total is what was actually paid after it,
  never the full retail price.
- Where a discount applies to one item, put the net amount on that item. Where
  it applies to the whole basket, add it as its own negative line item.
- If a line shows quantity x unit price, the amount is the line total.

Categories - use exactly these six:
- Groceries: supermarkets and household food shopping.
- Transport: ride-hailing trips, fuel, taxis, public transport, parking, tolls.
- Chill: restaurants, takeaways, food delivery, bars, entertainment.
- Subscriptions: recurring monthly services.
- Lily: anything bought for Lily.
- Miscellaneous: anything that fits none of the above.

Important classification rule: a food order that appears inside a ride-hailing
or delivery app screenshot (for example KFC or Pizza Perfect in an Uber or Bolt
history) is Chill, not Transport. Only the actual trip fares in such a
screenshot are Transport. If one screenshot mixes trips and food orders, set the
receipt category from what dominates the amount and categorise each line item on
its own merits.

Be accurate rather than complete: if a figure is genuinely unreadable, leave the
line out, set confidence to low, and say so in notes. Never invent an amount.`;

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ExtractionError(
      "ANTHROPIC_API_KEY is not set, so receipts cannot be read. Add it to your environment and redeploy.",
    );
  }
  cachedClient ??= new Anthropic();
  return cachedClient;
}

function documentBlock(
  base64: string,
  mimeType: SupportedMimeType,
): Anthropic.ContentBlockParam {
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: mimeType, data: base64 },
  };
}

export type ExtractInput = {
  base64: string;
  mimeType: SupportedMimeType;
  /**
   * The month being worked on, as "YYYY-MM". Used only as a hint for receipts
   * that print an ambiguous or partial date.
   */
  monthHint?: string;
};

export async function extractReceipt({
  base64,
  mimeType,
  monthHint,
}: ExtractInput): Promise<ExtractedReceipt> {
  const today = new Date().toISOString().slice(0, 10);

  const instruction = [
    "Extract this receipt.",
    `Today is ${today}.`,
    monthHint ? `It is being filed under the month ${monthHint}.` : null,
    "If the receipt shows no date at all, return null for date rather than guessing.",
  ]
    .filter(Boolean)
    .join(" ");

  const message = await client().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(ReceiptSchema),
    },
    messages: [
      {
        role: "user",
        content: [documentBlock(base64, mimeType), { type: "text", text: instruction }],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new ExtractionError(
      "The model declined to read this file. Try a clearer photo of the receipt itself.",
    );
  }

  if (message.stop_reason === "max_tokens") {
    throw new ExtractionError(
      "This receipt was too long to read in one pass. Try photographing it in two halves.",
    );
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new ExtractionError(
      "Could not read a receipt in that file. Check that the whole slip is in frame and in focus.",
    );
  }

  return normaliseExtraction(parsed);
}

/**
 * Tidies the model's output into something the review screen can trust:
 * amounts rounded to cents, categories guaranteed valid, empty lines dropped,
 * and a total that is never left at zero when the line items say otherwise.
 */
export function normaliseExtraction(parsed: z.infer<typeof ReceiptSchema>): ExtractedReceipt {
  const lineItems = parsed.line_items
    .map((item) => ({
      item_name: item.item_name.trim() || "Item",
      amount: round2(item.amount),
      quantity:
        item.quantity === null || !Number.isFinite(item.quantity)
          ? null
          : round2(item.quantity),
      category: toCategory(item.category),
    }))
    .filter((item) => item.item_name.length > 0);

  const itemsTotal = sum(lineItems.map((item) => item.amount));
  const total = round2(parsed.total);

  return {
    store_name: parsed.store_name.trim() || "Unknown store",
    date: normaliseDate(parsed.date),
    // A zero total with real line items is almost always a missed total row.
    total: total === 0 && itemsTotal !== 0 ? itemsTotal : total,
    category: toCategory(parsed.category),
    line_items: lineItems,
    confidence: parsed.confidence,
    notes: parsed.notes?.trim() || null,
  };
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${year}-${month}-${day}`;
}
