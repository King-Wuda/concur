"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  ReferenceLine,
  YAxis,
} from "recharts";

import { formatSteps, type BodyLog } from "@/lib/body";

type Point = BodyLog & { weight_avg: number | null };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const label = (date: string) => {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
};

const axis = { fontSize: 12, fill: "var(--ink-muted)" };
const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--ink)",
};

/**
 * Two charts, not one with two axes: kilos and steps have nothing in common
 * but the dates. Weight draws each morning as a faint dot and the 7-day
 * average as the line to read; steps are a bar per day.
 */
export function BodyTrends({ logs, stepGoal }: { logs: Point[]; stepGoal: number | null }) {
  const weights = logs.filter((log) => log.weight_kg !== null);
  const steps = logs.filter((log) => log.steps !== null);

  if (weights.length === 0 && steps.length === 0) {
    return (
      <p className="card p-4 text-sm text-ink-muted">
        Log a few days and your weight and steps trends show up here.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="card p-4">
        <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Weight</h2>
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: "var(--accent)" }}
              />
              7-day average
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: "var(--ink-muted)" }}
              />
              Daily
            </span>
          </span>
        </header>
        {weights.length < 2 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            Two weigh-ins draw a line.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={weights}
                margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={label}
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  // Whole kilos either side of the data, so ticks land on whole numbers.
                  domain={[
                    (min: number) => Math.floor(min) - 1,
                    (max: number) => Math.ceil(max) + 1,
                  ]}
                  allowDecimals={false}
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => label(String(value))}
                  formatter={(value, name) => [
                    `${value} kg`,
                    name === "weight_avg" ? "7-day average" : "Weighed",
                  ]}
                />
                <Line
                  dataKey="weight_kg"
                  stroke="transparent"
                  dot={{ r: 3, fill: "var(--ink-muted)", stroke: "none" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="weight_avg"
                  stroke="var(--accent)"
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Steps</h2>
        {steps.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            No steps logged yet.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={steps}
                margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              >
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={label}
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  tick={axis}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "var(--surface-sunken)" }}
                  labelFormatter={(value) => label(String(value))}
                  formatter={(value) => [formatSteps(Number(value)), "Steps"]}
                />
                {stepGoal && (
                  <ReferenceLine
                    y={stepGoal}
                    ifOverflow="extendDomain"
                    stroke="var(--ink-secondary)"
                    strokeDasharray="4 4"
                    label={{
                      value: `Goal ${formatSteps(stepGoal)}`,
                      position: "insideTopRight",
                      fontSize: 11,
                      fill: "var(--ink-secondary)",
                    }}
                  />
                )}
                <Bar
                  dataKey="steps"
                  fill="var(--series-3)"
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
