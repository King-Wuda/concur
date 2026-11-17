"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { addTransfer, deleteTransfer } from "@/app/budget/events/actions";
import type { TransferRow } from "@/lib/events-data";
import type { Participant } from "@/lib/events";
import { formatRand, parseRand } from "@/lib/money";

/**
 * Money people on the trip sent each other - say Thabo sends you his half so
 * you can pay the whole Airbnb. It counts in the settle-up, and what you send
 * or receive counts in your monthly budget under the trip's category.
 */
export function TransfersSection({
  eventId,
  participants,
  transfers,
  today,
  category,
}: {
  eventId: string;
  participants: Participant[];
  transfers: TransferRow[];
  today: string;
  category: string | null;
}) {
  const router = useRouter();
  const me = participants.find((p) => p.is_me);
  const others = participants.filter((p) => !p.is_me);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(others[0]?.id ?? "");
  const [to, setTo] = useState(me?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => {
    const p = participants.find((x) => x.id === id);
    return p ? (p.is_me ? "You" : p.name) : "Someone";
  };

  async function save() {
    setError(null);
    setSaving(true);
    const result = await addTransfer({
      eventId,
      from,
      to,
      amount: parseRand(amount),
      date,
      note: note.trim() || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAmount("");
    setNote("");
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this transfer?")) return;
    const result = await deleteTransfer(id);
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  if (participants.length < 2) return null;

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Money sent</h2>
          <p className="text-sm text-ink-secondary">
            Money people sent each other for the trip, e.g. their share so you can pay for them.
          </p>
        </div>
        {!open && (
          <button type="button" className="btn shrink-0" onClick={() => setOpen(true)}>
            Add
          </button>
        )}
      </header>

      {open && (
        <div className="space-y-3 rounded-lg bg-sunken p-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm font-medium">
              From
              <select className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.is_me ? "You" : p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              To
              <select className="field" value={to} onChange={(e) => setTo(e.target.value)}>
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.is_me ? "You" : p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Amount
              <input
                className="field field-money"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Date
              <input
                type="date"
                className="field"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm font-medium">
            Note <span className="font-normal text-ink-muted">(optional)</span>
            <input
              className="field"
              placeholder="His half of the Airbnb"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {(from === me?.id || to === me?.id) && category && (
            <p className="text-xs text-ink-muted">
              {to === me?.id
                ? `Comes off "${category}" in your monthly budget, so it shows your real share.`
                : `Counts as spending under "${category}" in your monthly budget.`}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || from === to || parseRand(amount) <= 0}
              onClick={() => void save()}
            >
              {saving ? "Saving..." : "Save transfer"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {transfers.length === 0 ? (
        !open && <p className="text-sm text-ink-muted">No money sent yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {transfers.map((t) => (
            <li key={t.id} className="flex items-baseline gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{nameOf(t.from)}</span> →{" "}
                <span className="font-medium">{nameOf(t.to)}</span>
                <span className="block text-xs text-ink-muted">
                  {t.date}
                  {t.note && ` · ${t.note}`}
                </span>
              </span>
              <span className="tabular font-medium">{formatRand(t.amount)}</span>
              <button
                type="button"
                className="text-xs text-ink-muted underline underline-offset-4"
                onClick={() => void remove(t.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
