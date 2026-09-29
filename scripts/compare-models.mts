/**
 * Runs the bundled receipt fixtures through several models and reports which
 * of them get the answer right, how long they take, and what they cost.
 *
 *   npm run compare:models
 *   npm run compare:models -- claude-opus-5-5 claude-sonnet-5-5
 *
 * The point is to pick the model on evidence rather than on reputation. It
 * uses the real prompt and schema from src/lib/extract.ts, so what it measures
 * is what the app actually does - not an approximation that can drift.
 *
 * It spends real money: roughly a cent per receipt per model.
 */
import fs from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ReceiptSchema, SYSTEM_PROMPT, normaliseExtraction } from "@/lib/extract";
import type { ExtractedReceipt } from "@/lib/types";
import { round2, sum } from "@/lib/money";

/** Dollars per million tokens, from https://anthropic.com/pricing */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Haiku 4.5 rejects the effort parameter; Opus, Sonnet 5+ and Fable take it. */
const SUPPORTS_EFFORT = /^claude-(opus|fable|mythos|sonnet-5)/;

/**
 * What each fixture must get right.
 *
 * Only things the brief actually specifies are asserted. An earlier version of
 * this compared whole category maps against one model's output, which made a
 * genuine judgement call look like a failure: tinned baby food bought at a
 * supermarket is defensibly Groceries and defensibly Lily, and models differ on
 * it between runs. Asserting one of those as truth measures agreement with a
 * guess, not correctness - so the ambiguous item is left alone and the rules
 * that do have a right answer are checked instead.
 */
type Fixture = {
  file: string;
  checks: { name: string; ok: (result: Result) => boolean }[];
};

type Result = {
  receipt: ExtractedReceipt;
  totals: Record<string, number>;
};

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const FIXTURES: Fixture[] = [
  {
    file: "till-slip.png",
    checks: [
      {
        // The rule: log what left the account, not what the slip printed.
        name: "total is the R537.26 paid, not the R787.26 printed",
        ok: ({ receipt }) => near(receipt.total, 537.26),
      },
      {
        name: "nappies are filed under Lily",
        ok: ({ receipt }) =>
          receipt.line_items.some(
            (item) => /nappies|huggies/i.test(item.item_name) && item.category === "Lily",
          ),
      },
      {
        name: "the basket discount is netted off the mince",
        ok: ({ receipt }) =>
          receipt.line_items.some(
            (item) => /mince/i.test(item.item_name) && near(item.amount, 104.39),
          ),
      },
      {
        name: "no subtotal, VAT or change row is treated as an item",
        ok: ({ receipt }) =>
          !receipt.line_items.some((item) =>
            /^(subtotal|vat|total|change|card payment)/i.test(item.item_name.trim()),
          ),
      },
    ],
  },
  {
    file: "uber-history.png",
    checks: [
      {
        name: "total is R693.30",
        ok: ({ receipt }) => near(receipt.total, 693.3),
      },
      {
        // The rule from the brief: food delivery inside a ride-hailing
        // screenshot is Chill, and only the fares are Transport.
        name: "trips are Transport (R350.30)",
        ok: ({ totals }) => near(totals.Transport ?? 0, 350.3),
      },
      {
        name: "the KFC and Pizza Perfect orders are Chill (R343.00)",
        ok: ({ totals }) => near(totals.Chill ?? 0, 343),
      },
    ],
  },
];

const client = new Anthropic();

async function run(model: string, file: string) {
  const started = Date.now();

  const message = await client.messages.parse({
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      ...(SUPPORTS_EFFORT.test(model) ? { effort: "medium" as const } : {}),
      format: zodOutputFormat(ReceiptSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: fs.readFileSync(`fixtures/receipts/${file}`).toString("base64"),
            },
          },
          {
            type: "text",
            text: "Extract this receipt. It is being filed under the month 2026-09.",
          },
        ],
      },
    ],
  });

  const receipt = normaliseExtraction(message.parsed_output!);
  const price = PRICES[model];

  return {
    receipt,
    seconds: (Date.now() - started) / 1000,
    cost: price
      ? (message.usage.input_tokens / 1e6) * price.input +
        (message.usage.output_tokens / 1e6) * price.output
      : null,
  };
}

/** Category totals as the dashboard computes them, residual included. */
function categoryTotals(receipt: Awaited<ReturnType<typeof run>>["receipt"]) {
  const totals: Record<string, number> = {};
  for (const item of receipt.line_items) {
    totals[item.category] = round2((totals[item.category] ?? 0) + item.amount);
  }
  const residual = round2(receipt.total - sum(receipt.line_items.map((i) => i.amount)));
  if (residual !== 0) {
    totals[receipt.category] = round2((totals[receipt.category] ?? 0) + residual);
  }
  return totals;
}

async function main() {
  const named = process.argv.slice(2);
  const chosen = named.length > 0 ? named : Object.keys(PRICES);

  for (const model of chosen) {
    console.log(`\n=== ${model} ===`);
    let cost = 0;
    let seconds = 0;
    let passed = 0;
    let total = 0;

    for (const fixture of FIXTURES) {
      const { receipt, seconds: elapsed, cost: spent } = await run(model, fixture.file);
      seconds += elapsed;
      cost += spent ?? 0;

      const result: Result = { receipt, totals: categoryTotals(receipt) };
      const reconciles = near(
        Object.values(result.totals).reduce((a, b) => a + b, 0),
        receipt.total,
      );

      console.log(
        `  ${fixture.file}  ${elapsed.toFixed(1)}s` +
          (spent === null ? "" : `  $${spent.toFixed(4)}`) +
          (reconciles ? "" : "   !! category totals do not reconcile"),
      );

      for (const check of fixture.checks) {
        total += 1;
        const ok = check.ok(result);
        if (ok) passed += 1;
        console.log(`      ${ok ? "pass" : "FAIL"}  ${check.name}`);
      }
    }

    const n = FIXTURES.length;
    console.log(
      `  -> ${passed}/${total} checks, ${(seconds / n).toFixed(1)}s per receipt` +
        (cost
          ? `, $${(cost / n).toFixed(4)} each (100 receipts = $${((cost / n) * 100).toFixed(2)})`
          : ""),
    );
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
