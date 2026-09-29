"use client";

import { useState } from "react";

import {
  ExpenseForm,
  emptyExpense,
  type ExpenseValues,
} from "@/components/ExpenseForm";
import type { MonthKey } from "@/lib/month";

/**
 * Adding an expense without a receipt: cash, a transfer, a subscription charge,
 * anything where there is no slip to photograph or it is not worth the trouble.
 *
 * It is the same form the scanner hands you, just starting empty - so a typed
 * expense and a scanned one are the same kind of thing once saved, and both can
 * carry line items if the spend is worth breaking up.
 */
export function ManualExpense({ monthKey }: { monthKey: MonthKey }) {
  const [values, setValues] = useState<ExpenseValues>(() => emptyExpense(monthKey));
  // Remounting the form is how it gets cleared for the next entry.
  const [formKey, setFormKey] = useState(0);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  return (
    <ExpenseForm
      key={formKey}
      monthKey={monthKey}
      initial={values}
      storeLabel="Store or description"
      storePlaceholder="Parking, barber, birthday present..."
      submitLabel="Save expense"
      onSavedAndContinue={(name) => {
        setValues(emptyExpense(monthKey));
        setFormKey((key) => key + 1);
        setSavedMessage(`${name} saved. Ready for the next one.`);
      }}
      notice={
        savedMessage ? (
          <p role="status" className="text-sm" style={{ color: "var(--good-ink)" }}>
            {savedMessage}
          </p>
        ) : null
      }
    />
  );
}
