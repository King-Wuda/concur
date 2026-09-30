import type { Category } from "@/lib/categories";

export type MonthRow = {
  id: string;
  user_id: string;
  month: string; // "YYYY-MM-01"
  salary: number;
  salary_after_tax: number;
  tithe: number;
  rent: number;
  investec: number;
  notes: string | null;
};

export type BudgetRow = {
  id: string;
  month_id: string;
  category: Category;
  budgeted_amount: number;
};

export type LineItemRow = {
  id: string;
  receipt_id: string;
  item_name: string;
  amount: number;
  quantity: number | null;
  category: Category;
  position: number;
};

export type ReceiptRow = {
  id: string;
  month_id: string;
  store_name: string;
  date: string; // "YYYY-MM-DD"
  total: number;
  category: Category;
  image_path: string | null;
  note: string | null;
  created_at: string;
};

export type ReceiptWithItems = ReceiptRow & { line_items: LineItemRow[] };

export type FixedExpenseRow = {
  id: string;
  month_id: string;
  name: string;
  amount: number;
  category: Category;
  include_in_budget: boolean;
  position: number;
};

/**
 * Money arriving during the month that is not salary: someone sending money, a
 * refund, a side job. Carries no category - see supabase/migrations/0003.
 */
export type IncomeRow = {
  id: string;
  month_id: string;
  source: string;
  date: string; // "YYYY-MM-DD"
  amount: number;
  note: string | null;
  created_at: string;
};

/** Everything one month needs, fetched once. */
export type MonthSnapshot = {
  monthKey: string;
  month: MonthRow;
  budgets: BudgetRow[];
  receipts: ReceiptWithItems[];
  fixedExpenses: FixedExpenseRow[];
  income: IncomeRow[];
};

/** A draft receipt as returned by the vision model, before the user confirms. */
export type ExtractedLineItem = {
  item_name: string;
  amount: number;
  quantity: number | null;
  category: Category;
};

export type ExtractedReceipt = {
  store_name: string;
  date: string | null;
  total: number;
  category: Category;
  line_items: ExtractedLineItem[];
  confidence: "high" | "medium" | "low";
  notes: string | null;
};
