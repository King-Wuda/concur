"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { EVENT_CATEGORIES } from "@/lib/events";
import { createCategory, moveCategoryRows } from "@/lib/category-rows";
import { budgetMonthOf, ensureMonth } from "@/lib/data";
import { round2 } from "@/lib/money";
import { isIsoDate } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

/** Every write to trips and events. Row level security backs each one up. */

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

const Id = z.string().uuid();
const DateSchema = z.string().refine(isIsoDate, "Expected a real date like 2026-12-20");
const Money = z.number().finite().min(0).max(10_000_000);
const Name = z.string().trim().min(1, "Give it a name.").max(80);

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Sign in again.");
  return { supabase, userId: user.id };
}

function failure(error: unknown): { ok: false; error: string } {
  const code =
    typeof error === "object" && error && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  if (code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204") {
    return {
      ok: false,
      error: "Run supabase/migrations/0009_events.sql in the Supabase SQL editor first.",
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message: unknown }).message)
        : "Something went wrong.";
  return { ok: false, error: message };
}

function revalidate() {
  revalidatePath("/budget", "layout");
  revalidatePath("/");
}

const EventFields = z
  .object({
    name: z.string().trim().min(1, "Give the trip or event a name.").max(120),
    start_date: DateSchema.nullable(),
    end_date: DateSchema.nullable(),
    budget: Money,
    category_budgets: z.partialRecord(z.enum(EVENT_CATEGORIES), Money),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((e) => !e.start_date || !e.end_date || e.start_date <= e.end_date, {
    message: "The end date is before the start date.",
  });

export type EventFieldsInput = z.input<typeof EventFields>;

async function writeBudgets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
  budgets: Partial<Record<(typeof EVENT_CATEGORIES)[number], number>>,
) {
  const removed = await supabase
    .from("event_budgets")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (removed.error) throw removed.error;
  const rows = Object.entries(budgets)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([category, amount]) => ({
      user_id: userId,
      event_id: eventId,
      category,
      amount: round2(amount ?? 0),
    }));
  if (rows.length > 0) {
    const inserted = await supabase.from("event_budgets").insert(rows);
    if (inserted.error) throw inserted.error;
  }
}

/** A new trip or event, with you on it and anyone else named. */
export async function createEvent(
  raw: EventFieldsInput & { participants: string[] },
): Promise<ActionResult<{ id: string }>> {
  try {
    const input = EventFields.parse(raw);
    const others = z.array(Name).max(50).parse(
      raw.participants.map((name) => name.trim()).filter(Boolean),
    );
    const { supabase, userId } = await session();

    const inserted = await supabase
      .from("events")
      .insert({
        user_id: userId,
        name: input.name,
        start_date: input.start_date,
        end_date: input.end_date,
        budget: round2(input.budget),
        notes: input.notes || null,
      })
      .select("id")
      .single();
    if (inserted.error) throw inserted.error;
    const eventId = inserted.data.id as string;

    try {
      // Every row names every column: in a bulk insert a column one row
      // leaves out is sent as null for it, not as the column's default.
      const people = await supabase.from("event_participants").insert([
        { user_id: userId, event_id: eventId, name: "You", is_me: true, position: 0 },
        ...others.map((name, index) => ({
          user_id: userId,
          event_id: eventId,
          name,
          is_me: false,
          position: index + 1,
        })),
      ]);
      if (people.error) throw people.error;

      await writeBudgets(supabase, userId, eventId, input.category_budgets);
      // The trip's own category in your monthly budget, named after it.
      await createCategory(supabase, userId, input.name, eventId);
    } catch (error) {
      // Leave no half-made trip behind.
      await supabase.from("events").delete().eq("id", eventId).eq("user_id", userId);
      throw error;
    }
    revalidate();
    return { ok: true, data: { id: eventId } };
  } catch (error) {
    return failure(error);
  }
}

export async function updateEvent(raw: EventFieldsInput & { id: string }): Promise<ActionResult> {
  try {
    const id = Id.parse(raw.id);
    const input = EventFields.parse(raw);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("events")
      .update({
        name: input.name,
        start_date: input.start_date,
        end_date: input.end_date,
        budget: round2(input.budget),
        notes: input.notes || null,
      })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    await writeBudgets(supabase, userId, id, input.category_budgets);

    // Renaming the trip renames its category, if the new name is free.
    const own = await supabase
      .from("budget_categories")
      .select("name")
      .eq("event_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (own.error) throw own.error;
    const wanted = input.name.slice(0, 34);
    if (own.data && own.data.name !== wanted) {
      const renamed = await supabase
        .from("budget_categories")
        .update({ name: wanted })
        .eq("event_id", id)
        .eq("user_id", userId);
      if (!renamed.error) await moveCategoryRows(supabase, userId, own.data.name, wanted);
      else if (renamed.error.code !== "23505" && renamed.error.code !== "23514") {
        throw renamed.error;
      }
    }

    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Deletes a trip. Receipts you paid stay in your monthly budget, just no
 * longer on a trip; receipts others paid existed only for the trip, so they go
 * with it.
 */
export async function deleteEvent(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const theirs = await supabase
      .from("receipts")
      .delete()
      .eq("event_id", id)
      .is("month_id", null)
      .eq("user_id", userId);
    if (theirs.error) throw theirs.error;
    const mine = await supabase
      .from("receipts")
      .update({ event_id: null, paid_by: null, event_category: null })
      .eq("event_id", id)
      .eq("user_id", userId);
    if (mine.error) throw mine.error;
    // What you paid stays in your months, back under Miscellaneous; the
    // trip's category and its budgets go with the trip.
    const own = await supabase
      .from("budget_categories")
      .select("name")
      .eq("event_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (own.error) throw own.error;
    if (own.data) {
      await moveCategoryRows(supabase, userId, own.data.name, "Miscellaneous", {
        dropBudgets: true,
      });
    }
    const { error } = await supabase.from("events").delete().eq("id", id).eq("user_id", userId);
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function addParticipant(eventId: string, name: string): Promise<ActionResult> {
  try {
    Id.parse(eventId);
    const clean = Name.parse(name);
    const { supabase, userId } = await session();
    const last = await supabase
      .from("event_participants")
      .select("position")
      .eq("event_id", eventId)
      .eq("user_id", userId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw last.error;
    const { error } = await supabase.from("event_participants").insert({
      user_id: userId,
      event_id: eventId,
      name: clean,
      position: (last.data?.position ?? 0) + 1,
    });
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function renameParticipant(id: string, name: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const clean = Name.parse(name);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("event_participants")
      .update({ name: clean })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("is_me", false);
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Takes someone off a trip. Not you, and not someone who paid for anything -
 * those receipts would lose their payer; reassign them first.
 */
export async function removeParticipant(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const paid = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("paid_by", id)
      .eq("user_id", userId);
    if (paid.error) throw paid.error;
    if ((paid.count ?? 0) > 0) {
      return {
        ok: false,
        error: "They paid for something on this trip. Change who paid for it first.",
      };
    }
    const sent = await supabase
      .from("event_transfers")
      .select("id", { count: "exact", head: true })
      .or(`from_participant.eq.${id},to_participant.eq.${id}`)
      .eq("user_id", userId);
    if (sent.error) throw sent.error;
    if ((sent.count ?? 0) > 0) {
      return {
        ok: false,
        error: "They sent or received money on this trip. Delete those transfers first.",
      };
    }
    const { error } = await supabase
      .from("event_participants")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .eq("is_me", false);
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Money sent between people on a trip                                        */
/* -------------------------------------------------------------------------- */

const TransferInput = z
  .object({
    eventId: Id,
    from: Id,
    to: Id,
    amount: z.number().finite().gt(0, "Enter how much was sent.").max(10_000_000),
    date: DateSchema,
    note: z.string().trim().max(200).nullable().optional(),
  })
  .refine((t) => t.from !== t.to, { message: "Someone cannot send money to themselves." });

export type TransferInput = z.input<typeof TransferInput>;

/**
 * Records money one person on a trip sent another. It counts in the settle-up;
 * if you sent or received it, it also counts in that month's budget under
 * the trip's category.
 */
export async function addTransfer(raw: TransferInput): Promise<ActionResult> {
  try {
    const input = TransferInput.parse(raw);
    const { supabase, userId } = await session();

    const people = await supabase
      .from("event_participants")
      .select("id, is_me")
      .eq("event_id", input.eventId)
      .eq("user_id", userId)
      .in("id", [input.from, input.to]);
    if (people.error) throw people.error;
    const rows = (people.data ?? []) as { id: string; is_me: boolean }[];
    if (rows.length !== 2) return { ok: false, error: "Those people are not on this trip." };

    const involvesYou = rows.some((p) => p.is_me);
    const month = involvesYou
      ? await ensureMonth(supabase, userId, await budgetMonthOf(supabase, userId, input.date))
      : null;

    const { error } = await supabase.from("event_transfers").insert({
      user_id: userId,
      event_id: input.eventId,
      from_participant: input.from,
      to_participant: input.to,
      amount: round2(input.amount),
      date: input.date,
      note: input.note || null,
      month_id: month?.id ?? null,
    });
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteTransfer(id: string): Promise<ActionResult> {
  try {
    Id.parse(id);
    const { supabase, userId } = await session();
    const { error } = await supabase
      .from("event_transfers")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
    revalidate();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
