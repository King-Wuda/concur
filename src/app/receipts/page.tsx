import Link from "next/link";
import { redirect } from "next/navigation";

import { ExportMenu } from "@/components/ExportMenu";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { ReceiptList } from "@/components/ReceiptList";
import { getMonthSnapshot, listMonthKeys } from "@/lib/data";
import { formatRand } from "@/lib/money";
import { formatMonthLong, normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Receipts - Budget" };

export default async function ReceiptsPage({
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

  const [snapshot, knownMonths] = await Promise.all([
    getMonthSnapshot(supabase, user.id, monthKey),
    listMonthKeys(supabase, user.id),
  ]);

  const total = snapshot.receipts.reduce((acc, r) => acc + (Number(r.total) || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher monthKey={monthKey} knownMonths={knownMonths} />
        <ExportMenu monthKey={monthKey} />
      </div>

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Receipts · {formatMonthLong(monthKey)}
          </h1>
          <p className="text-sm text-ink-secondary">
            {snapshot.receipts.length} receipt
            {snapshot.receipts.length === 1 ? "" : "s"} · {formatRand(total)}
          </p>
        </div>
        <Link href={`/capture?m=${monthKey}`} className="btn btn-primary">
          Add a receipt
        </Link>
      </header>

      {snapshot.receipts.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-secondary">
          Nothing logged for this month yet.
        </p>
      ) : (
        <ReceiptList receipts={snapshot.receipts} />
      )}
    </div>
  );
}
