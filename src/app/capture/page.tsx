import { redirect } from "next/navigation";

import { ReceiptCapture } from "@/components/ReceiptCapture";
import { formatMonthLong, normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Add a receipt - Budget" };

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
        <h1 className="text-xl font-semibold tracking-tight">Add a receipt</h1>
        <p className="text-sm text-ink-secondary">
          Photograph the slip or pick a PDF. It gets read for you, and you confirm
          before anything is saved to {formatMonthLong(monthKey)}.
        </p>
      </header>

      <ReceiptCapture monthKey={monthKey} userId={user.id} />
    </div>
  );
}
