"use client";

import { createContext, useContext } from "react";

import type { Participant } from "@/lib/events";

/**
 * The trip or event receipts are being added to, if any. Forms read it to
 * show "Paid by" and the trip category, and to put each receipt on the trip.
 */
export type Trip = {
  id: string;
  name: string;
  participants: Participant[];
  /** The trip's own category in your monthly budget, where its receipts go. */
  category: string | null;
};

const TripContext = createContext<Trip | null>(null);

export function TripProvider({ trip, children }: { trip: Trip | null; children: React.ReactNode }) {
  return <TripContext.Provider value={trip}>{children}</TripContext.Provider>;
}

export function useTrip(): Trip | null {
  return useContext(TripContext);
}
