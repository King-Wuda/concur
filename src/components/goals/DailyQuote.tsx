"use client";

import Link from "next/link";
import { useState } from "react";

import type { Quote } from "@/lib/quotes";

/**
 * Today's quote or affirmation. The day decides which one (see lib/quotes),
 * so it is the same everywhere all day; "Show another" picks a different one
 * at random for the moment, without changing what the day shows next time.
 */
export function DailyQuote({
  quotes,
  todays,
}: {
  quotes: Quote[];
  todays: Quote | null;
}) {
  const [shown, setShown] = useState<Quote | null>(todays);

  if (!shown) {
    return (
      <section className="card p-4 text-sm text-ink-secondary">
        Add your own quotes and affirmations and one will greet you here each
        day.{" "}
        <Link
          href="/goals/quotes"
          className="font-medium text-accent underline underline-offset-4"
        >
          Add some
        </Link>
      </section>
    );
  }

  function another() {
    const others = quotes.filter((quote) => quote.id !== shown?.id);
    if (others.length === 0) return;
    setShown(others[Math.floor(Math.random() * others.length)]);
  }

  return (
    <figure className="card relative space-y-2 overflow-hidden p-4 sm:p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: "var(--accent)" }}
      />
      <figcaption className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {shown.kind === "affirmation" ? "Today's affirmation" : "Today's quote"}
      </figcaption>
      <blockquote className="text-lg leading-snug font-medium">
        {shown.kind === "quote" ? `“${shown.text}”` : shown.text}
      </blockquote>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-secondary">
          {shown.author ? `— ${shown.author}` : ""}
        </span>
        {quotes.length > 1 && (
          <button
            type="button"
            onClick={another}
            className="shrink-0 text-sm font-medium text-accent underline underline-offset-4"
          >
            Show another
          </button>
        )}
      </div>
    </figure>
  );
}
