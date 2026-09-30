import { redirect } from "next/navigation";

import { AddExpense } from "@/components/AddExpense";
import { formatMonthLong, normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add to the month - Budget" };

export default async function CapturePage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const monthKey = normaliseMonthKey(m);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Add to the month</h1>
        <p className="text-sm text-ink-secondary">
          Photograph a slip and it gets read for you, type an expense in
          yourself, or record money that came in. Nothing is saved to{" "}
          {formatMonthLong(monthKey)} until you confirm it.
        </p>
      </header>

      <AddExpense monthKey={monthKey} userId={user.id} />
    </div>
  );
}
