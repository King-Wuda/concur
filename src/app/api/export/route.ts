import { NextResponse, type NextRequest } from "next/server";

import { getMonthSnapshot, listMonthKeys } from "@/lib/data";
import { buildWorkbook, buildWorkbookFilename } from "@/lib/excel";
import { normaliseMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

/**
 * Excel export. `?scope=month` (default) exports the requested month;
 * `?scope=all` exports every month, one tab each, the way the original
 * spreadsheet was laid out.
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "month";
  const monthKey = normaliseMonthKey(request.nextUrl.searchParams.get("m") ?? undefined);

  try {
    const monthKeys =
      scope === "all"
        ? ((await listMonthKeys(supabase, user.id)).reverse() ?? [])
        : [monthKey];

    const keys = monthKeys.length > 0 ? monthKeys : [monthKey];
    const snapshots = [];
    for (const key of keys) {
      snapshots.push(await getMonthSnapshot(supabase, user.id, key));
    }

    const workbook = await buildWorkbook(snapshots, scope);
    const filename = buildWorkbookFilename(keys, scope);

    return new NextResponse(workbook, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export failed", error);
    return NextResponse.json({ error: "Building the workbook failed." }, { status: 500 });
  }
}
