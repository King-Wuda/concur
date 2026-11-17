"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { addCategory, removeCategory, renameCategory } from "@/app/budget/actions";
import { useCategories } from "@/components/CategoriesContext";

/**
 * Your own categories, next to the built-in six: add, rename, remove. A
 * removed category's spending moves to Miscellaneous. Trips' categories come
 * and go with their trip.
 */
export function CategoryManager() {
  const router = useRouter();
  const all = useCategories();
  const own = all.filter((c) => c.kind === "custom");
  const trips = all.filter((c) => c.kind === "trip");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(true);
    const result = await action();
    setBusy(false);
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
        <h2 className="font-semibold">Your categories</h2>
        <p className="text-sm text-ink-secondary">
          Add your own next to the built-in six. Each gets a budget above, a meter on the
          dashboard and a slice of the chart.
        </p>
      </header>

      {own.length > 0 && (
        <ul className="divide-y divide-[var(--border)] text-sm">
          {own.map((c) => (
            <li key={c.name} className="flex min-h-11 items-center gap-2 py-1">
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
              {editing === c.name ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await run(() => renameCategory(c.name, draft))) setEditing(null);
                  }}
                >
                  <label className="sr-only" htmlFor={`rename-cat-${c.name}`}>
                    New name for {c.name}
                  </label>
                  <input
                    id={`rename-cat-${c.name}`}
                    className="field"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={busy}>
                    Save
                  </button>
                </form>
              ) : (
                <>
                  <span className="flex-1 font-medium">{c.name}</span>
                  <button
                    type="button"
                    className="text-xs font-medium text-accent underline underline-offset-4"
                    onClick={() => {
                      setEditing(c.name);
                      setDraft(c.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-ink-secondary underline underline-offset-4"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove "${c.name}"? Anything filed under it moves to Miscellaneous.`,
                        )
                      ) {
                        void run(() => removeCategory(c.name));
                      }
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => addCategory(name))) setName("");
        }}
      >
        <label className="sr-only" htmlFor="new-category">
          New category
        </label>
        <input
          id="new-category"
          className="field"
          placeholder="Gifts, Car, Holidays..."
          value={name}
          maxLength={34}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy || !name.trim()}>
          Add category
        </button>
      </form>

      {trips.length > 0 && (
        <p className="text-xs text-ink-muted">
          Trip categories ({trips.map((t) => t.name).join(", ")}) are made with each trip and go
          when it is deleted.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
