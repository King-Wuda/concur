/**
 * Runs a receipt through the real extraction pipeline and prints what came
 * back, including how the dashboard would file it. This is the one part of the
 * app that cannot be covered by unit tests - it needs a live model and a funded
 * Anthropic account - so it is a script you run by hand rather than a test.
 *
 *   npm run try:extract                        # both bundled fixtures
 *   npm run try:extract -- path/to/receipt.png # your own
 *
 * It spends real money: roughly a cent per receipt.
 */
import fs from "node:fs";
import path from "node:path";
import { extractReceipt, type SupportedMimeType } from "@/lib/extract";
import { analyseMonth } from "@/lib/aggregate";
import { formatRand, sum } from "@/lib/money";
import type { MonthSnapshot } from "@/lib/types";

const DEFAULT_FIXTURES = [
  "fixtures/receipts/till-slip.png",
  "fixtures/receipts/uber-history.png",
];

const MIME_TYPES: Record<string, SupportedMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

async function main() {
  const files = process.argv.slice(2);
  for (const file of files.length > 0 ? files : DEFAULT_FIXTURES) {
    const mimeType = MIME_TYPES[path.extname(file).toLowerCase()];
    if (!mimeType) {
      console.error(`Skipping ${file}: not a format receipts can be read from.`);
      continue;
    }
    const started = Date.now();
    const receipt = await extractReceipt({
      base64: fs.readFileSync(file).toString("base64"),
      mimeType,
      monthHint: "2026-09",
    });

    const itemsTotal = sum(receipt.line_items.map((i) => i.amount));

    console.log(`\n=== ${file.split("/").pop()}  (${((Date.now() - started) / 1000).toFixed(1)}s) ===`);
    console.log(`store      ${receipt.store_name}`);
    console.log(`date       ${receipt.date}`);
    console.log(`total      ${formatRand(receipt.total)}`);
    console.log(`category   ${receipt.category}`);
    console.log(`confidence ${receipt.confidence}`);
    if (receipt.notes) console.log(`notes      ${receipt.notes}`);
    console.log(`items      ${receipt.line_items.length}, summing to ${formatRand(itemsTotal)}`);
    for (const item of receipt.line_items) {
      console.log(
        `  ${formatRand(item.amount).padStart(12)}  ${item.category.padEnd(14)} ${item.item_name}` +
          (item.quantity !== null ? `  (qty ${item.quantity})` : ""),
      );
    }

    const snapshot: MonthSnapshot = {
      monthKey: "2026-09",
      month: { id: "m", user_id: "u", month: "2026-09-01", salary: 0, salary_after_tax: 0, tithe: 0, rent: 0, investec: 0, notes: null },
      budgets: [],
      fixedExpenses: [],
      receipts: [{
        id: "r", month_id: "m", store_name: receipt.store_name, date: receipt.date ?? "2026-09-01",
        total: receipt.total, category: receipt.category, image_path: null, note: null, created_at: "",
        line_items: receipt.line_items.map((item, index) => ({
          id: String(index), receipt_id: "r", item_name: item.item_name, amount: item.amount,
          quantity: item.quantity, category: item.category, position: index,
        })),
      }],
    };

    const { categories, totals } = analyseMonth(snapshot);
    console.log("  -> as the dashboard would show it:");
    for (const c of categories.filter((c) => c.actual !== 0)) {
      console.log(`     ${c.category.padEnd(14)} ${formatRand(c.actual)}`);
    }
    console.log(
      `     ${"TOTAL".padEnd(14)} ${formatRand(totals.categoryActualTotal)}` +
        (Math.abs(totals.categoryActualTotal - receipt.total) < 0.005 ? "  (reconciles)" : "  (MISMATCH)"),
    );
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
