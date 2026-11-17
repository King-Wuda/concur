"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { EVENT_CATEGORIES } from "@/lib/events";
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

    const people = await supabase.from("event_participants").insert([
      { user_id: userId, event_id: eventId, name: "You", is_me: true, position: 0 },
      ...others.map((name, index) => ({
        user_id: userId,
        event_id: eventId,
        name,
        position: index + 1,
      })),
    ]);
    if (people.error) throw people.error;

    await writeBudgets(supabase, userId, eventId, input.category_budgets);
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
