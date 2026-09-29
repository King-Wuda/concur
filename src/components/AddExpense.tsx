"use client";

import { useState } from "react";

import { ManualExpense } from "@/components/ManualExpense";
import { ReceiptCapture } from "@/components/ReceiptCapture";
import type { MonthKey } from "@/lib/month";

/**
 * Chooses how an expense gets entered. Scanning is first because it is the
 * quicker route when there is a slip in hand; typing it is there for cash, a
 * transfer, or a receipt not worth photographing.
 *
 * Each mode keeps its own state while the other is on screen: switching across
 * to check something does not throw away a half-filled form.
 */

const MODES = [
  { id: "scan", label: "Scan a receipt" },
  { id: "manual", label: "Enter it manually" },
] as const;

type Mode = (typeof MODES)[number]["id"];

export function AddExpense({
  monthKey,
  userId,
}: {
  monthKey: MonthKey;
  userId: string;
}) {
  const [mode, setMode] = useState<Mode>("scan");
  const [visited, setVisited] = useState<Mode[]>(["scan"]);

  function choose(next: Mode) {
    setMode(next);
    setVisited((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="How to add the expense"
        className="mx-auto flex max-w-md gap-1 rounded-lg bg-sunken p-1"
      >
        {MODES.map((option) => (
          <button
            key={option.id}
            role="tab"
            type="button"
            aria-selected={mode === option.id}
            onClick={() => choose(option.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
              mode === option.id ? "bg-surface text-ink shadow-sm" : "text-ink-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Mounted once visited and then only hidden, so switching tabs does not
          discard a draft - or a receipt already uploaded and read. */}
      {visited.includes("scan") && (
        <div hidden={mode !== "scan"}>
          <ReceiptCapture monthKey={monthKey} userId={userId} />
        </div>
      )}
      {visited.includes("manual") && (
        <div hidden={mode !== "manual"}>
          <ManualExpense monthKey={monthKey} />
        </div>
      )}
    </div>
  );
}
