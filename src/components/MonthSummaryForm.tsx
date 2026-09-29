"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveMonthSummary } from "@/app/actions";
import { MoneyField } from "@/components/MoneyField";
import { SaveBar } from "@/components/SaveBar";
import { formatRand, parseRand, round2 } from "@/lib/money";
import type { MonthKey } from "@/lib/month";
import type { MonthRow } from "@/lib/types";

/** Income and the fixed summary block carried over from the old workbook. */
export function MonthSummaryForm({
  monthKey,
  month,
}: {
  monthKey: MonthKey;
  month: MonthRow;
}) {
  const router = useRouter();

  const [salary, setSalary] = useState(asField(month.salary));
  const [afterTax, setAfterTax] = useState(asField(month.salary_after_tax));
  const [tithe, setTithe] = useState(asField(month.tithe));
  const [rent, setRent] = useState(asField(month.rent));
  const [investec, setInvestec] = useState(asField(month.investec));
  const [notes, setNotes] = useState(month.notes ?? "");

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  const parsedSalary = parseRand(salary);
  const expectedTithe = round2(parsedSalary * 0.1);
  const titheDiffers = parsedSalary > 0 && Math.abs(parseRand(tithe) - expectedTithe) >= 0.01;

  async function save() {
    setStatus("saving");
    setError(null);

    const result = await saveMonthSummary({
      monthKey,
      salary: parsedSalary,
      salary_after_tax: parseRand(afterTax),
      tithe: parseRand(tithe),
      rent: parseRand(rent),
      investec: parseRand(investec),
      notes: notes.trim() || null,
    });

    if (!result.ok) {
      setError(result.error);
      setStatus("idle");
      return;
    }

    setStatus("saved");
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <header>
        <h2 className="font-semibold">Income and commitments</h2>
        <p className="text-sm text-ink-secondary">
          Rent, Investec and the tithe come off the top before anything is budgeted.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <MoneyField
          id="salary"
          label="Salary"
          value={salary}
          onChange={setSalary}
          onBlur={() => {
            // Keep the tithe tracking salary until it is edited by hand.
            if (parseRand(tithe) === 0) setTithe(String(round2(parseRand(salary) * 0.1)));
          }}
        />
        <MoneyField
          id="after-tax"
          label="Salary after tax"
          value={afterTax}
          onChange={setAfterTax}
          hint="What actually landed in the account"
        />
        <MoneyField
          id="tithe"
          label="Tithe"
          value={tithe}
          onChange={setTithe}
          hint={
            titheDiffers
              ? `10% of salary would be ${formatRand(expectedTithe)}`
              : "10% of salary"
          }
          action={
            titheDiffers
              ? {
                  label: "Use 10%",
                  onClick: () => setTithe(String(expectedTithe)),
                }
              : undefined
          }
        />
        <MoneyField id="rent" label="Rent" value={rent} onChange={setRent} />
        <MoneyField
          id="investec"
          label="Investec"
          value={investec}
          onChange={setInvestec}
          hint="Investment allocation"
        />
        <div className="space-y-1.5">
          <label htmlFor="notes" className="text-sm font-medium">
            Notes <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="notes"
            className="field"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Bonus month, double rent, ..."
          />
        </div>
      </div>

      <SaveBar status={status} error={error} onSave={save} />
    </section>
  );
}

function asField(value: number | string | null): string {
  const numeric = Number(value) || 0;
  return numeric === 0 ? "" : String(round2(numeric));
}
