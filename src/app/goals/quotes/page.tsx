import { redirect } from "next/navigation";

import { GoalsSetupNeeded } from "@/components/goals/GoalsSetupNeeded";
import { QuotesEditor } from "@/components/goals/QuotesEditor";
import { GoalsNotSetUpError, listQuotes } from "@/lib/goals-data";
import { todayInSouthAfrica } from "@/lib/period";
import { quoteForDay } from "@/lib/quotes";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Quotes - Goals" };

export default async function QuotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let quotes;
  try {
    quotes = await listQuotes(supabase, user.id);
  } catch (error) {
    if (error instanceof GoalsNotSetUpError) return <GoalsSetupNeeded />;
    throw error;
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Quotes &amp; affirmations
        </h1>
        <p className="text-sm text-ink-secondary">
          Your own words to live by. Each day one is picked at random and shown
          on Home and Today. Every one gets its turn before any comes round
          again.
        </p>
      </header>
      <QuotesEditor
        quotes={quotes}
        todaysId={quoteForDay(quotes, todayInSouthAfrica())?.id ?? null}
      />
    </div>
  );
}
