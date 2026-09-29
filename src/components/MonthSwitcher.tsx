"use client";

import { usePathname, useRouter } from "next/navigation";

import {
  currentMonthKey,
  formatMonthLong,
  shiftMonth,
  type MonthKey,
} from "@/lib/month";

/**
 * Moves between months. The month lives in the URL, so a particular month can
 * be bookmarked or shared between devices.
 */
export function MonthSwitcher({
  monthKey,
  knownMonths,
}: {
  monthKey: MonthKey;
  knownMonths: MonthKey[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const go = (key: MonthKey) => {
    router.push(key === currentMonthKey() ? pathname : `${pathname}?m=${key}`);
  };

  // Always offer the current month and the two on either side of where we are,
  // plus anything with data already.
  const options = [
    ...new Set([
      ...knownMonths,
      currentMonthKey(),
      shiftMonth(currentMonthKey(), 1),
      shiftMonth(monthKey, -1),
      shiftMonth(monthKey, 1),
      monthKey,
    ]),
  ].sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="btn size-11 !p-0"
        onClick={() => go(shiftMonth(monthKey, -1))}
        aria-label="Previous month"
      >
        <Chevron direction="left" />
      </button>

      <label className="sr-only" htmlFor="month-select">
        Month
      </label>
      <select
        id="month-select"
        className="field max-w-[13rem] font-medium"
        value={monthKey}
        onChange={(event) => go(event.target.value)}
      >
        {options.map((key) => (
          <option key={key} value={key}>
            {formatMonthLong(key)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="btn size-11 !p-0"
        onClick={() => go(shiftMonth(monthKey, 1))}
        aria-label="Next month"
      >
        <Chevron direction="right" />
      </button>
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}
