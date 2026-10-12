"use client";

import { createContext, useContext } from "react";

import type { MonthStart } from "@/lib/period";

/**
 * Which paydays have moved, for forms that need to say which budget month a
 * date lands in before it is saved. The server files it by the same rule
 * (lib/period), so what the form promises is where it goes.
 */
const BudgetCalendarContext = createContext<readonly MonthStart[]>([]);

export function BudgetCalendar({
  starts,
  children,
}: {
  starts: readonly MonthStart[];
  children: React.ReactNode;
}) {
  return (
    <BudgetCalendarContext.Provider value={starts}>{children}</BudgetCalendarContext.Provider>
  );
}

export function useMonthStarts(): readonly MonthStart[] {
  return useContext(BudgetCalendarContext);
}
