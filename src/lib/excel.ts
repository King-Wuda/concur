import ExcelJS from "exceljs";

import { analyseMonth, type MonthAnalysis } from "@/lib/aggregate";
import { formatMonthLong, formatMonthShort } from "@/lib/month";
import type { MonthSnapshot } from "@/lib/types";

/**
 * Excel export. The workbook mirrors the structure of the spreadsheet this app
 * replaces - a tab per month with the summary block and the category
 * breakdown - and adds flat sheets so the raw receipts and line items can be
 * filtered or pivoted.
 */

const RAND_FORMAT = '"R"#,##0.00';
const HEADER_FILL = "FFF0EFEC";
const TITLE_SIZE = 14;

type Sheet = ExcelJS.Worksheet;

export function buildWorkbookFilename(monthKeys: string[], scope: "month" | "all"): string {
  if (scope === "all") {
    return `budget-all-${new Date().toISOString().slice(0, 10)}.xlsx`;
  }
  return `budget-${monthKeys[0] ?? "export"}.xlsx`;
}

export async function buildWorkbook(
  snapshots: MonthSnapshot[],
  scope: "month" | "all",
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Personal budget";
  workbook.created = new Date();

  const analyses = snapshots.map((snapshot) => ({
    snapshot,
    analysis: analyseMonth(snapshot),
  }));

  if (scope === "all" && analyses.length > 1) {
    addOverviewSheet(workbook, analyses);
  }

  for (const { snapshot, analysis } of analyses) {
    const name =
      scope === "all" ? sheetName(formatMonthShort(snapshot.monthKey)) : "Summary";
    addMonthSheet(workbook.addWorksheet(name), snapshot, analysis);
  }

  addIncomeSheet(workbook, analyses, scope);
  addReceiptSheet(workbook, analyses, scope);
  addLineItemSheet(workbook, analyses, scope);
  addFixedExpenseSheet(workbook, analyses, scope);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

/** Excel forbids several characters in sheet names and caps them at 31 chars. */
function sheetName(raw: string): string {
  return raw.replace(/[*?:\\/[\]]/g, "-").slice(0, 31);
}

function styleHeaderRow(sheet: Sheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
}

function money(sheet: Sheet, columnKeys: string[]) {
  for (const key of columnKeys) {
    const column = sheet.getColumn(key);
    column.numFmt = RAND_FORMAT;
  }
}

/** One month: the summary block, then budget vs actual per category. */
function addMonthSheet(sheet: Sheet, snapshot: MonthSnapshot, analysis: MonthAnalysis) {
  const { totals, categories } = analysis;

  sheet.getColumn("A").width = 28;
  sheet.getColumn("B").width = 16;
  sheet.getColumn("C").width = 16;
  sheet.getColumn("D").width = 16;
  sheet.getColumn("E").width = 14;

  const title = sheet.addRow([formatMonthLong(snapshot.monthKey)]);
  title.font = { bold: true, size: TITLE_SIZE };
  sheet.addRow([]);

  const summaryRows: [string, number][] = [
    ["Salary", totals.salary],
    ["Salary after tax", totals.salaryAfterTax],
    ["Other money in", totals.incomeTotal],
    ["Total money in", totals.availableTotal],
    ["Tithe (10%)", totals.tithe],
    ["Rent", totals.rent],
    ["Investec", totals.investec],
    ["Subscriptions & fixed", totals.fixedTotal],
    ["Receipt spend", totals.receiptsTotal],
    ["Total spend", totals.totalSpend],
    ["Planned spend", totals.plannedSpend],
    ["Left / saved", totals.remaining],
    ["Left if on plan", totals.plannedRemaining],
    ["Ahead of plan", totals.savingsVsPlan],
  ];

  const summaryHeader = sheet.addRow(["Summary", "Amount"]);
  styleHeaderRow(sheet, summaryHeader.number);
  for (const [label, amount] of summaryRows) {
    const row = sheet.addRow([label, amount]);
    row.getCell(2).numFmt = RAND_FORMAT;
    if (
      label === "Total spend" ||
      label === "Left / saved" ||
      label === "Total money in"
    ) {
      row.font = { bold: true };
    }
  }

  sheet.addRow([]);

  const categoryHeader = sheet.addRow([
    "Category",
    "Budgeted",
    "Actual",
    "Variance",
    "Status",
  ]);
  styleHeaderRow(sheet, categoryHeader.number);

  for (const category of categories) {
    const row = sheet.addRow([
      category.category,
      category.budgeted,
      category.actual,
      category.variance,
      category.isOver ? "Over budget" : "Within budget",
    ]);
    for (const index of [2, 3, 4]) row.getCell(index).numFmt = RAND_FORMAT;
    if (category.isOver) {
      row.getCell(5).font = { color: { argb: "FFD03B3B" }, bold: true };
    }
  }

  const totalRow = sheet.addRow([
    "Total",
    totals.budgetTotal,
    totals.categoryActualTotal,
    totals.savingsVsPlan,
    "",
  ]);
  totalRow.font = { bold: true };
  for (const index of [2, 3, 4]) totalRow.getCell(index).numFmt = RAND_FORMAT;
}

/** One row per month, for the all-data export. */
function addOverviewSheet(
  workbook: ExcelJS.Workbook,
  analyses: { snapshot: MonthSnapshot; analysis: MonthAnalysis }[],
) {
  const sheet = workbook.addWorksheet("Overview");
  sheet.columns = [
    { header: "Month", key: "month", width: 16 },
    { header: "Salary", key: "salary", width: 14 },
    { header: "Salary after tax", key: "afterTax", width: 16 },
    { header: "Other money in", key: "income", width: 16 },
    { header: "Tithe", key: "tithe", width: 12 },
    { header: "Rent", key: "rent", width: 12 },
    { header: "Investec", key: "investec", width: 12 },
    { header: "Fixed", key: "fixed", width: 12 },
    { header: "Receipts", key: "receipts", width: 14 },
    { header: "Total spend", key: "spend", width: 14 },
    { header: "Budgeted", key: "budgeted", width: 14 },
    { header: "Left / saved", key: "left", width: 14 },
    { header: "Ahead of plan", key: "plan", width: 14 },
    { header: "Over-budget categories", key: "over", width: 30 },
  ];
  styleHeaderRow(sheet, 1);

  for (const { snapshot, analysis } of analyses) {
    const t = analysis.totals;
    sheet.addRow({
      month: formatMonthShort(snapshot.monthKey),
      salary: t.salary,
      afterTax: t.salaryAfterTax,
      income: t.incomeTotal,
      tithe: t.tithe,
      rent: t.rent,
      investec: t.investec,
      fixed: t.fixedTotal,
      receipts: t.receiptsTotal,
      spend: t.totalSpend,
      budgeted: t.budgetTotal,
      left: t.remaining,
      plan: t.savingsVsPlan,
      over: t.overspentCategories.join(", "),
    });
  }

  money(sheet, [
    "salary",
    "afterTax",
    "income",
    "tithe",
    "rent",
    "investec",
    "fixed",
    "receipts",
    "spend",
    "budgeted",
    "left",
    "plan",
  ]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addIncomeSheet(
  workbook: ExcelJS.Workbook,
  analyses: { snapshot: MonthSnapshot }[],
  scope: "month" | "all",
) {
  const sheet = workbook.addWorksheet(scope === "all" ? "All Income" : "Income");
  sheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Date", key: "date", width: 12 },
    { header: "From", key: "source", width: 30 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Note", key: "note", width: 36 },
  ];
  styleHeaderRow(sheet, 1);

  for (const { snapshot } of analyses) {
    for (const row of snapshot.income) {
      sheet.addRow({
        month: snapshot.monthKey,
        date: row.date,
        source: row.source,
        amount: Number(row.amount) || 0,
        note: row.note ?? "",
      });
    }
  }

  money(sheet, ["amount"]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addReceiptSheet(
  workbook: ExcelJS.Workbook,
  analyses: { snapshot: MonthSnapshot }[],
  scope: "month" | "all",
) {
  const sheet = workbook.addWorksheet(scope === "all" ? "All Receipts" : "Receipts");
  sheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Date", key: "date", width: 12 },
    { header: "Store", key: "store", width: 30 },
    { header: "Category", key: "category", width: 16 },
    { header: "Total", key: "total", width: 14 },
    { header: "Items", key: "items", width: 8 },
    { header: "Note", key: "note", width: 36 },
  ];
  styleHeaderRow(sheet, 1);

  for (const { snapshot } of analyses) {
    for (const receipt of snapshot.receipts) {
      sheet.addRow({
        month: snapshot.monthKey,
        date: receipt.date,
        store: receipt.store_name,
        category: receipt.category,
        total: Number(receipt.total) || 0,
        items: receipt.line_items.length,
        note: receipt.note ?? "",
      });
    }
  }

  money(sheet, ["total"]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addLineItemSheet(
  workbook: ExcelJS.Workbook,
  analyses: { snapshot: MonthSnapshot }[],
  scope: "month" | "all",
) {
  const sheet = workbook.addWorksheet(scope === "all" ? "All Line Items" : "Line Items");
  sheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Date", key: "date", width: 12 },
    { header: "Store", key: "store", width: 28 },
    { header: "Item", key: "item", width: 40 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Category", key: "category", width: 16 },
  ];
  styleHeaderRow(sheet, 1);

  for (const { snapshot } of analyses) {
    for (const receipt of snapshot.receipts) {
      for (const item of receipt.line_items) {
        sheet.addRow({
          month: snapshot.monthKey,
          date: receipt.date,
          store: receipt.store_name,
          item: item.item_name,
          qty: item.quantity ?? "",
          amount: Number(item.amount) || 0,
          category: item.category,
        });
      }
    }
  }

  money(sheet, ["amount"]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addFixedExpenseSheet(
  workbook: ExcelJS.Workbook,
  analyses: { snapshot: MonthSnapshot }[],
  scope: "month" | "all",
) {
  const sheet = workbook.addWorksheet(
    scope === "all" ? "All Fixed Expenses" : "Fixed Expenses",
  );
  sheet.columns = [
    { header: "Month", key: "month", width: 12 },
    { header: "Name", key: "name", width: 24 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Category", key: "category", width: 16 },
    { header: "Counts toward budget", key: "counts", width: 20 },
  ];
  styleHeaderRow(sheet, 1);

  for (const { snapshot } of analyses) {
    for (const fixed of snapshot.fixedExpenses) {
      sheet.addRow({
        month: snapshot.monthKey,
        name: fixed.name,
        amount: Number(fixed.amount) || 0,
        category: fixed.category,
        counts: fixed.include_in_budget ? "Yes" : "No",
      });
    }
  }

  money(sheet, ["amount"]);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
