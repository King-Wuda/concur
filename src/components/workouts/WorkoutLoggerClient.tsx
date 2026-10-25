"use client";

import dynamic from "next/dynamic";

/**
 * The logger renders in the browser only: it picks up an unfinished workout
 * from this device's storage, which the server cannot see.
 */
export const WorkoutLoggerClient = dynamic(
  () => import("@/components/workouts/WorkoutLogger").then((m) => m.WorkoutLogger),
  {
    ssr: false,
    loading: () => <p className="text-sm text-ink-muted">Loading the workout...</p>,
  },
);
