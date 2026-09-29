import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";

import { buildWorkbook, buildWorkbookFilename } from "@/lib/excel";
import type { MonthSnapshot } from "@/lib/types";

function snapshot(monthKey: string, salary: number): MonthSnapshot {
  return {
    monthKey,
    month: {
      id: `month-${monthKey}`,
      user_id: "user-1",
      month: `${monthKey}-01`,
      salary,
      salary_after_tax: salary * 0.76,
      tithe: salary * 0.1,
      rent: 12_000,
      investec: 4_000,
      notes: null,
    },
    budgets: [
      {
        id: "b1",
        month_id: `month-${monthKey}`,
        category: "Groceries",
        budgeted_amount: 4_000,
      },
      { id: "b2", month_id: `month-${monthKey}`, category: "Chill", budgeted_amount: 1_500 },
    ],
    receipts: [
      {
        id: "r1",
        month_id: `month-${monthKey}`,
        store_name: "Checkers Hyper",
        date: `${monthKey}-08`,
        total: 4_250,
        category: "Groceries",
        image_path: null,
        note: "Big shop",
        created_at: `${monthKey}-08T10:00:00Z`,
        line_items: [
          {
            id: "i1",
            receipt_id: "r1",
            item_name: "Milk 2L",
            amount: 32.99,
            quantity: 2,
            category: "Groceries",
            position: 0,
          },
          {
            id: "i2",
            receipt_id: "r1",
            item_name: "Nappies",
            amount: 217.01,
            quantity: null,
            category: "Lily",
            position: 1,
          },
        ],
      },
    ],
    fixedExpenses: [
      {
        id: "f1",
        month_id: `month-${monthKey}`,
        name: "Spotify",
        amount: 69,
        category: "Subscriptions",
        include_in_budget: true,
        position: 0,
      },
    ],
  };
}

async function read(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

test("a single-month export has the expected sheets and figures", async () => {
  const workbook = await read(await buildWorkbook([snapshot("2026-09", 50_000)], "month"));

  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Summary", "Receipts", "Line Items", "Fixed Expenses"],
  );

  const summary = workbook.getWorksheet("Summary")!;
  const labels: string[] = [];
  summary.eachRow((row) => {
    const first = row.getCell(1).value;
    if (typeof first === "string") labels.push(first);
  });

  assert.ok(labels.includes("Salary"));
  assert.ok(labels.includes("Left / saved"));
  assert.ok(labels.includes("Groceries"));
  assert.ok(labels.includes("Miscellaneous"));

  // The Groceries row: R4 000 budgeted, R4 032.99 actual once the Lily item is
  // split out and the receipt's residual is attributed back.
  const groceriesRow = findRow(summary, "Groceries");
  assert.equal(groceriesRow?.getCell(2).value, 4_000);
  assert.equal(groceriesRow?.getCell(3).value, 4_032.99);
  assert.equal(groceriesRow?.getCell(5).value, "Over budget");

  const lilyRow = findRow(summary, "Lily");
  assert.equal(lilyRow?.getCell(3).value, 217.01);
  assert.equal(lilyRow?.getCell(5).value, "Over budget");

  const lineItems = workbook.getWorksheet("Line Items")!;
  assert.equal(lineItems.rowCount, 3); // header plus two items
  assert.equal(lineItems.getRow(2).getCell(4).value, "Milk 2L");
  assert.equal(lineItems.getRow(2).getCell(6).value, 32.99);
});

test("amounts are formatted as rand, not left as bare numbers", async () => {
  const workbook = await read(await buildWorkbook([snapshot("2026-09", 50_000)], "month"));
  const receipts = workbook.getWorksheet("Receipts")!;
  // Column keys are not carried in the file, so address the total by index.
  assert.match(String(receipts.getRow(2).getCell(5).numFmt), /R/);
});

test("an all-months export gets a tab per month plus an overview", async () => {
  const buffer = await buildWorkbook(
    [snapshot("2026-08", 48_000), snapshot("2026-09", 50_000)],
    "all",
  );
  const workbook = await read(buffer);

  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    [
      "Overview",
      "Aug 2026",
      "Sep 2026",
      "All Receipts",
      "All Line Items",
      "All Fixed Expenses",
    ],
  );

  const overview = workbook.getWorksheet("Overview")!;
  assert.equal(overview.rowCount, 3); // header plus two months
  assert.equal(overview.getRow(2).getCell(2).value, 48_000);

  const receipts = workbook.getWorksheet("All Receipts")!;
  assert.equal(receipts.rowCount, 3);
  assert.equal(receipts.getRow(2).getCell(1).value, "2026-08");
});

test("filenames say what is inside", () => {
  assert.equal(buildWorkbookFilename(["2026-09"], "month"), "budget-2026-09.xlsx");
  assert.match(buildWorkbookFilename(["2026-08", "2026-09"], "all"), /^budget-all-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

function findRow(sheet: ExcelJS.Worksheet, label: string) {
  let found: ExcelJS.Row | undefined;
  sheet.eachRow((row) => {
    if (row.getCell(1).value === label) found = row;
  });
  return found;
}
