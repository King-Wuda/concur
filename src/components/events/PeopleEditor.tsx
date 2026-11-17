"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { addParticipant, removeParticipant, renameParticipant } from "@/app/budget/events/actions";
import type { Participant } from "@/lib/events";

/** The people on a trip: add, rename, or remove anyone who has not paid for anything. */
export function PeopleEditor({
  eventId,
  participants,
  paidIds,
}: {
  eventId: string;
  participants: Participant[];
  paidIds: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const result = await action();
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <section className="card space-y-3 p-4 sm:p-5">
      <header>
        <h2 className="font-semibold">People</h2>
        <p className="text-sm text-ink-secondary">
          Everything is split equally between the {participants.length}{" "}
          {participants.length === 1 ? "person" : "people"} here.
        </p>
      </header>
      <ul className="divide-y divide-[var(--border)] text-sm">
        {participants.map((p) => (
          <li key={p.id} className="flex min-h-11 items-center gap-2 py-1">
            {editing === p.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(() => renameParticipant(p.id, draft))) setEditing(null);
                }}
              >
                <label className="sr-only" htmlFor={`rename-${p.id}`}>
                  New name for {p.name}
                </label>
                <input
                  id={`rename-${p.id}`}
                  className="field"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="btn">
                  Save
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 font-medium">{p.is_me ? "You" : p.name}</span>
                {!p.is_me && (
                  <>
                    <button
                      type="button"
                      className="text-xs font-medium text-accent underline underline-offset-4"
                      onClick={() => {
                        setEditing(p.id);
                        setDraft(p.name);
                      }}
                    >
                      Rename
                    </button>
                    {!paidIds.includes(p.id) && (
                      <button
                        type="button"
                        className="text-xs font-medium text-ink-secondary underline underline-offset-4"
                        onClick={() => {
                          if (window.confirm(`Take ${p.name} off this trip?`)) {
                            void run(() => removeParticipant(p.id));
                          }
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => addParticipant(eventId, name))) setName("");
        }}
      >
        <label className="sr-only" htmlFor="add-person">
          Add a person
        </label>
        <input
          id="add-person"
          className="field"
          placeholder="Add a person"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={!name.trim()}>
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
