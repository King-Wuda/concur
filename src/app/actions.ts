"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { CATEGORIES } from "@/lib/categories";
import { ensureMonth } from "@/lib/data";
import { round2 } from "@/lib/money";
import { clampDateToMonth, isMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

/**
 * Every write the app makes. Each action re-reads the session, so a stale page
 * cannot write on behalf of someone else, and row level security backs that up
 * at the database.
 */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

const MonthKeySchema = z.string().refine(isMonthKey, "Expected a month like 2026-09");
const CategorySchema = z.enum(CATEGORIES);
const AmountSchema = z.coerce.number().finite().min(-1_000_000).max(10_000_000);

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Sign in again.");
  return { supabase, userId: user.id };
}

function failure(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { ok: false, error: message };
}

function revalidateMonth() {
  revalidatePath("/");
  revalidatePath("/receipts");
  revalidatePath("/plan");
}

/* -------------------------------------------------------------------------- */
/* Receipts                                                                   */
/* -------------------------------------------------------------------------- */

const LineItemInput = z.object({
  item_name: z.string().trim().min(1).max(200),
  amount: AmountSchema,
  quantity: z.coerce.number().finite().min(0).max(100_000).nullable().optional(),
  category: CategorySchema,
});

const SaveReceiptInput = z.object({
  monthKey: MonthKeySchema,
  store_name: z.string().trim().min(1).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date like 2026-09-14"),
  total: AmountSchema,
  category: CategorySchema,
  note: z.string().trim().max(500).nullable().optional(),
  image_path: z.string().trim().max(400).nullable().optional(),
  raw_extraction: z.unknown().optional(),
  line_items: z.array(LineItemInput).max(300),
});

export type SaveReceiptInput = z.input<typeof SaveReceiptInput>;

/** Writes a confirmed receipt and its line items. */
export async function saveReceipt(
  raw: SaveReceiptInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = SaveReceiptInput.parse(raw);
    const { supabase, userId } = await session();
    const month = await ensureMonth(supabase, userId, input.monthKey);

    const inserted = await supabase
      .from("receipts")
      .insert({
        user_id: userId,
        month_id: month.id,
        store_name: input.store_name,
        // A receipt always belongs to the month it is filed under, even if the
        // slip's own date sits a day either side of the boundary.
        date: clampDateToMonth(input.date, input.monthKey),
        total: round2(input.total),
        category: input.category,
        note: input.note ?? null,
        image_path: input.image_path ?? null,
        raw_extraction: input.raw_extraction ?? null,
      })
      .select("id")
      .single();

    if (inserted.error) throw inserted.error;
    const receiptId = inserted.data.id as string;

    if (input.line_items.length > 0) {
      const items = await supabase.from("line_items").insert(
        input.line_items.map((item, index) => ({
          user_id: userId,
          receipt_id: receiptId,
          item_name: item.item_name,
          amount: round2(item.amount),
          quantity: item.quantity ?? null,
          category: item.category,
          position: index,
        })),
      );
      if (items.error) throw items.error;
    }

    revalidateMonth();
    return { ok: true, data: { id: receiptId } };
  } catch (error) {
    return failure(error);
  }
}

const UpdateReceiptInput = z.object({
  id: z.string().uuid(),
  store_name: z.string().trim().min(1).max(160).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  total: AmountSchema.optional(),
  category: CategorySchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
  /** When present, replaces the receipt's line items wholesale. */
  line_items: z.array(LineItemInput).max(300).optional(),
});

export type UpdateReceiptInput = z.input<typeof UpdateReceiptInput>;

export async function updateReceipt(raw: UpdateReceiptInput): Promise<ActionResult> {
  try {
    const input = UpdateReceiptInput.parse(raw);
    const { supabase, userId } = await session();

    const { id, line_items: lineItems, ...fields } = input;

    if (Object.keys(fields).length > 0) {
      const patch = { ...fields } as Record<string, unknown>;
      if (typeof fields.total === "number") patch.total = round2(fields.total);

      const updated = await supabase
        .from("receipts")
        .update(patch)
        .eq("id", id)
        .eq("user_id", userId);
      if (updated.error) throw updated.error;
    }

    if (lineItems) {
      const removed = await supabase
        .from("line_items")
        .delete()
        .eq("receipt_id", id)
        .eq("user_id", userId);
      if (removed.error) throw removed.error;

      if (lineItems.length > 0) {
        const items = await supabase.from("line_items").insert(
          lineItems.map((item, index) => ({
            user_id: userId,
            receipt_id: id,
            item_name: item.item_name,
            amount: round2(item.amount),
            quantity: item.quantity ?? null,
            category: item.category,
            position: index,
          })),
        );
        if (items.error) throw items.error;
      }
    }

    revalidateMonth();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** Removes a receipt, its line items (by cascade) and its stored file. */
export async function deleteReceipt(id: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    const { supabase, userId } = await session();

    const existing = await supabase
      .from("receipts")
      .select("image_path")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing.error) throw existing.error;

    const deleted = await supabase
      .from("receipts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (deleted.error) throw deleted.error;

    const path = existing.data?.image_path as string | null | undefined;
    if (path) {
      // Best effort: a leftover file is untidy but not a failure worth
      // surfacing once the receipt itself is gone.
      await supabase.storage.from("receipts").remove([path]);
    }

    revalidateMonth();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** A short-lived URL for viewing a stored receipt image. */
export async function signedReceiptUrl(path: string): Promise<ActionResult<{ url: string }>> {
  try {
    z.string().min(1).max(400).parse(path);
    const { supabase } = await session();
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return { ok: true, data: { url: data.signedUrl } };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Month summary, budgets and fixed expenses                                  */
/* -------------------------------------------------------------------------- */

const MonthSummaryInput = z.object({
  monthKey: MonthKeySchema,
  salary: AmountSchema,
  salary_after_tax: AmountSchema,
  tithe: AmountSchema,
  rent: AmountSchema,
  investec: AmountSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type MonthSummaryInput = z.input<typeof MonthSummaryInput>;

export async function saveMonthSummary(raw: MonthSummaryInput): Promise<ActionResult> {
  try {
    const input = MonthSummaryInput.parse(raw);
    const { supabase, userId } = await session();
    const month = await ensureMonth(supabase, userId, input.monthKey);

    const { error } = await supabase
      .from("months")
      .update({
        salary: round2(input.salary),
        salary_after_tax: round2(input.salary_after_tax),
        tithe: round2(input.tithe),
        rent: round2(input.rent),
        investec: round2(input.investec),
        notes: input.notes ?? null,
      })
      .eq("id", month.id)
      .eq("user_id", userId);

    if (error) throw error;

    revalidateMonth();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

const BudgetsInput = z.object({
  monthKey: MonthKeySchema,
  budgets: z.array(z.object({ category: CategorySchema, budgeted_amount: AmountSchema })),
});

export type BudgetsInput = z.input<typeof BudgetsInput>;

export async function saveBudgets(raw: BudgetsInput): Promise<ActionResult> {
  try {
    const input = BudgetsInput.parse(raw);
    const { supabase, userId } = await session();
    const month = await ensureMonth(supabase, userId, input.monthKey);

    const { error } = await supabase.from("budgets").upsert(
      input.budgets.map((budget) => ({
        user_id: userId,
        month_id: month.id,
        category: budget.category,
        budgeted_amount: round2(budget.budgeted_amount),
      })),
      { onConflict: "month_id,category" },
    );

    if (error) throw error;

    revalidateMonth();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

const FixedExpensesInput = z.object({
  monthKey: MonthKeySchema,
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        amount: AmountSchema,
        category: CategorySchema,
        include_in_budget: z.boolean(),
      }),
    )
    .max(60),
});

export type FixedExpensesInput = z.input<typeof FixedExpensesInput>;

/** Replaces the month's fixed expense list with exactly what was submitted. */
export async function saveFixedExpenses(raw: FixedExpensesInput): Promise<ActionResult> {
  try {
    const input = FixedExpensesInput.parse(raw);
    const { supabase, userId } = await session();
    const month = await ensureMonth(supabase, userId, input.monthKey);

    const seen = new Set<string>();
    for (const item of input.items) {
      const key = item.name.toLowerCase();
      if (seen.has(key)) {
        return { ok: false, error: `"${item.name}" is listed twice. Names must be unique.` };
      }
      seen.add(key);
    }

    const existing = await supabase
      .from("fixed_expenses")
      .select("id, name")
      .eq("month_id", month.id);
    if (existing.error) throw existing.error;

    const keptNames = new Set(input.items.map((item) => item.name));
    const removedIds = ((existing.data ?? []) as { id: string; name: string }[])
      .filter((row) => !keptNames.has(row.name))
      .map((row) => row.id);

    if (removedIds.length > 0) {
      const removed = await supabase
        .from("fixed_expenses")
        .delete()
        .in("id", removedIds)
        .eq("user_id", userId);
      if (removed.error) throw removed.error;
    }

    if (input.items.length > 0) {
      const upserted = await supabase.from("fixed_expenses").upsert(
        input.items.map((item, index) => ({
          user_id: userId,
          month_id: month.id,
          name: item.name,
          amount: round2(item.amount),
          category: item.category,
          include_in_budget: item.include_in_budget,
          position: index,
        })),
        { onConflict: "month_id,name" },
      );
      if (upserted.error) throw upserted.error;
    }

    revalidateMonth();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
