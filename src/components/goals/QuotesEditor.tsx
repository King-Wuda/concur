"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createQuote, deleteQuote, updateQuote } from "@/app/goals/actions";
import type { Quote, QuoteKind } from "@/lib/quotes";

/** Add, edit and remove quotes and affirmations. */
export function QuotesEditor({
  quotes,
  todaysId,
}: {
  quotes: Quote[];
  todaysId: string | null;
}) {
  const [adding, setAdding] = useState(quotes.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const affirmations = quotes.filter((q) => q.kind === "affirmation").length;

  return (
    <div className="space-y-4">
      {adding ? (
        <QuoteForm
          onDone={quotes.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setAdding(true)}
        >
          Add a quote or affirmation
        </button>
      )}

      {quotes.length > 0 && (
        <p className="text-sm text-ink-muted">
          {quotes.length - affirmations} quote
          {quotes.length - affirmations === 1 ? "" : "s"} · {affirmations}{" "}
          affirmation{affirmations === 1 ? "" : "s"}
        </p>
      )}

      <ul className="space-y-2">
        {quotes.map((quote) =>
          editing === quote.id ? (
            <li key={quote.id}>
              <QuoteForm quote={quote} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={quote.id} className="card flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {quote.kind === "affirmation" ? "Affirmation" : "Quote"}
                  {quote.id === todaysId && (
                    <span className="ml-2 normal-case tracking-normal text-accent">
                      · showing today
                    </span>
                  )}
                </p>
                <p className="leading-snug">
                  {quote.kind === "quote" ? `“${quote.text}”` : quote.text}
                </p>
                {quote.author && (
                  <p className="text-sm text-ink-secondary">— {quote.author}</p>
                )}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setEditing(quote.id)}
              >
                Edit
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function QuoteForm({ quote, onDone }: { quote?: Quote; onDone?: () => void }) {
  const router = useRouter();
  const [kind, setKind] = useState<QuoteKind>(quote?.kind ?? "affirmation");
  const [text, setText] = useState(quote?.text ?? "");
  const [author, setAuthor] = useState(quote?.author ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefix = quote?.id ?? "new";

  async function save() {
    setError(null);
    setSaving(true);
    const input = { kind, text, author: author.trim() || null };
    const result = quote
      ? await updateQuote({ ...input, id: quote.id })
      : await createQuote(input);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!quote) {
      setText("");
      setAuthor("");
    }
    onDone?.();
    router.refresh();
  }

  async function remove() {
    if (!quote || !window.confirm("Delete this one?")) return;
    const result = await deleteQuote(quote.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onDone?.();
    router.refresh();
  }

  return (
    <section className="card space-y-3 p-4">
      <div
        role="radiogroup"
        aria-label="Kind"
        className="flex gap-1 rounded-lg bg-sunken p-1"
      >
        {(["affirmation", "quote"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => setKind(option)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              kind === option
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-secondary"
            }`}
          >
            {option === "affirmation" ? "Affirmation" : "Quote"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${prefix}-quote-text`} className="text-sm font-medium">
          {kind === "affirmation" ? "Affirmation" : "Quote"}
        </label>
        <textarea
          id={`${prefix}-quote-text`}
          className="field min-h-24"
          value={text}
          placeholder={
            kind === "affirmation"
              ? "I am disciplined, and I keep my promises to myself."
              : "We are what we repeatedly do. Excellence, then, is not an act, but a habit."
          }
          onChange={(event) => setText(event.target.value)}
        />
      </div>

      {kind === "quote" && (
        <div className="space-y-1.5">
          <label
            htmlFor={`${prefix}-quote-author`}
            className="text-sm font-medium"
          >
            Who said it{" "}
            <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id={`${prefix}-quote-author`}
            className="field"
            value={author}
            placeholder="Will Durant"
            onChange={(event) => setAuthor(event.target.value)}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !text.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : quote ? "Save" : "Add"}
        </button>
        {onDone && (
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
        )}
        {quote && (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            onClick={() => void remove()}
          >
            Delete
          </button>
        )}
        {error && (
          <span
            role="alert"
            className="text-sm"
            style={{ color: "var(--critical)" }}
          >
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
