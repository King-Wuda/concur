import type { SupabaseClient } from "@supabase/supabase-js";

import type { Category } from "@/lib/categories";
import {
  isEventCategory,
  summariseEvent,
  type EventCategory,
  type EventSummary,
  type Participant,
} from "@/lib/events";

/**
 * Database access for trips and events, through the caller's request-scoped
 * client so row level security applies.
 */

type DB = SupabaseClient;

export type EventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  notes: string | null;
  created_at: string;
};

export type EventReceipt = {
  id: string;
  store_name: string;
  date: string;
  total: number;
  category: Category;
  event_category: EventCategory | null;
  paid_by: string | null;
  image_path: string | null;
  month_id: string | null;
  line_count: number;
};

export type TransferRow = {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: string;
  note: string | null;
};

export type EventDetail = EventRow & {
  /** The trip's own category in your monthly budget. */
  category: string | null;
  transfers: TransferRow[];
  participants: Participant[];
  budgets: Partial<Record<EventCategory, number>>;
  receipts: EventReceipt[];
  summary: EventSummary;
};

/** Thrown until migration 0009 has been run, so pages can say so plainly. */
export class EventsNotSetUpError extends Error {
  constructor() {
    super("Run supabase/migrations/0009_events.sql in the Supabase SQL editor to set up trips.");
  }
}

function isMissing(error: { code?: string } | null): boolean {
  // Missing table (42P01, PGRST205) or the receipts columns not there yet (42703).
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.code === "42703" ||
    error?.code === "PGRST204"
  );
}

function check(error: { code?: string } | null) {
  if (isMissing(error)) throw new EventsNotSetUpError();
  if (error) throw error;
}

const EVENT_SELECT =
  "id, name, start_date, end_date, budget, notes, created_at," +
  " event_participants (id, name, is_me, position)," +
  " event_budgets (category, amount)," +
  " budget_categories (name)," +
  " event_transfers (id, from_participant, to_participant, amount, date, note)," +
  " receipts (id, store_name, date, total, category, event_category, paid_by, image_path, month_id, line_items (id))";

type RawEvent = EventRow & {
  event_participants: (Participant & { position: number })[];
  event_budgets: { category: string; amount: number }[];
  budget_categories: { name: string }[];
  event_transfers: {
    id: string;
    from_participant: string;
    to_participant: string;
    amount: number;
    date: string;
    note: string | null;
  }[];
  receipts: (Omit<EventReceipt, "line_count"> & { line_items: { id: string }[] })[];
};

function shape(raw: RawEvent): EventDetail {
  const participants = [...(raw.event_participants ?? [])]
    .sort((a, b) => Number(b.is_me) - Number(a.is_me) || a.position - b.position)
    .map(({ id, name, is_me }) => ({ id, name, is_me }));

  const budgets: Partial<Record<EventCategory, number>> = {};
  for (const row of raw.event_budgets ?? []) {
    if (isEventCategory(row.category)) budgets[row.category] = Number(row.amount) || 0;
  }

  const receipts = (raw.receipts ?? [])
    .map(({ line_items, ...receipt }) => ({
      ...receipt,
      total: Number(receipt.total) || 0,
      event_category: isEventCategory(receipt.event_category) ? receipt.event_category : null,
      line_count: line_items?.length ?? 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const transfers = (raw.event_transfers ?? [])
    .map((t) => ({
      id: t.id,
      from: t.from_participant,
      to: t.to_participant,
      amount: Number(t.amount) || 0,
      date: t.date,
      note: t.note,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const budget = Number(raw.budget) || 0;
  return {
    category: raw.budget_categories?.[0]?.name ?? null,
    transfers,
    id: raw.id,
    name: raw.name,
    start_date: raw.start_date,
    end_date: raw.end_date,
    budget,
    notes: raw.notes,
    created_at: raw.created_at,
    participants,
    budgets,
    receipts,
    summary: summariseEvent(budget, budgets, participants, receipts, transfers),
  };
}

/** Every trip and event, soonest or most recent first. */
export async function listEvents(supabase: DB, userId: string): Promise<EventDetail[]> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  check(error);
  return ((data ?? []) as unknown as RawEvent[]).map(shape);
}

export async function getEvent(
  supabase: DB,
  userId: string,
  id: string,
): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_SELECT)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  check(error);
  return data ? shape(data as unknown as RawEvent) : null;
}

/** A receipt not on any trip yet, that could be moved onto one. */
export type MovableReceipt = {
  id: string;
  store_name: string;
  date: string;
  total: number;
  category: Category;
};

/**
 * Receipts not on any trip, around a trip's dates - a week either side, in
 * case something was booked ahead - or the last two months for a trip with no
 * dates. Newest first.
 */
export function movableRange(
  event: Pick<EventRow, "start_date" | "end_date">,
  today: string,
): { from: string; to: string } {
  const shift = (iso: string, days: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };
  return {
    from: event.start_date ? shift(event.start_date, -7) : shift(today, -60),
    to: event.end_date
      ? shift(event.end_date, 7)
      : event.start_date
        ? shift(event.start_date, 30)
        : today,
  };
}

export async function listMovableReceipts(
  supabase: DB,
  userId: string,
  event: Pick<EventRow, "start_date" | "end_date">,
  today: string,
): Promise<MovableReceipt[]> {
  const { from, to } = movableRange(event, today);

  const { data, error } = await supabase
    .from("receipts")
    .select("id, store_name, date, total, category")
    .eq("user_id", userId)
    .is("event_id", null)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false })
    .limit(150);
  check(error);
  return ((data ?? []) as MovableReceipt[]).map((r) => ({ ...r, total: Number(r.total) || 0 }));
}

/** Just enough about each trip to offer it in a picker. */
export type TripOption = { id: string; name: string; start_date: string | null };

export async function listTripOptions(supabase: DB, userId: string): Promise<TripOption[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, start_date")
    .eq("user_id", userId)
    .order("start_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (isMissing(error)) return [];
  if (error) throw error;
  return (data ?? []) as TripOption[];
}
