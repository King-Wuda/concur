import { NextResponse, type NextRequest } from "next/server";
import * as z from "zod";

import {
  ExtractionError,
  ExtractionUnavailableError,
  extractReceipt,
  isSupportedMimeType,
} from "@/lib/extract";
import { isMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads an already-uploaded receipt and returns a draft for the user to review.
 * The file is fetched from private storage server-side, so the image itself
 * never travels through this request body - which also keeps phone photos well
 * clear of the serverless request size limit.
 */

// Reading a dense till slip can take a while; the default 10s is not enough.
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const BodySchema = z.object({
  path: z.string().min(1).max(400),
  monthKey: z.string().refine(isMonthKey).optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Expected a storage path to read." }, { status: 400 });
  }

  // The storage policies enforce this too; checking here gives a clearer error.
  if (!body.path.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "That file is not yours." }, { status: 403 });
  }

  const download = await supabase.storage.from("receipts").download(body.path);
  if (download.error || !download.data) {
    return NextResponse.json(
      { error: "Could not read the uploaded file. Try uploading it again." },
      { status: 404 },
    );
  }

  const blob = download.data;
  if (blob.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "That file is too large to read. Try a smaller photo." },
      { status: 413 },
    );
  }

  const mimeType = blob.type || "application/octet-stream";
  if (!isSupportedMimeType(mimeType)) {
    return NextResponse.json(
      { error: `Cannot read ${mimeType}. Use a JPEG, PNG, WebP, GIF or PDF.` },
      { status: 415 },
    );
  }

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  try {
    const receipt = await extractReceipt({
      base64,
      mimeType,
      monthHint: body.monthKey,
    });
    return NextResponse.json({ receipt });
  } catch (error) {
    if (error instanceof ExtractionUnavailableError) {
      // 503: the receipt is fine, the service behind it is not. The message is
      // safe to show - it names the setting to change, never a key or a token.
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof ExtractionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Receipt extraction failed", error);
    return NextResponse.json(
      { error: "Reading the receipt failed. Try again in a moment." },
      { status: 502 },
    );
  }
}
