"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { saveReceipt } from "@/app/actions";
import { LineItemEditor, type DraftLineItem } from "@/components/LineItemEditor";
import { CATEGORIES, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import { formatMonthLong, monthKeyToDate, type MonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/client";
import type { ExtractedReceipt } from "@/lib/types";

/**
 * The phone-first capture flow: pick or snap a file, it is read for you, then
 * you check the draft and save. Nothing reaches the budget until you confirm.
 *
 * The file goes straight from the browser to private storage, and only its path
 * is sent to the server for reading, which keeps large photos out of the
 * serverless request body.
 */

type Stage = "idle" | "uploading" | "reading" | "review" | "saving";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;

export function ReceiptCapture({
  monthKey,
  userId,
}: {
  monthKey: MonthKey;
  userId: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [rawExtraction, setRawExtraction] = useState<ExtractedReceipt | null>(null);

  const [storeName, setStoreName] = useState("");
  const [date, setDate] = useState(monthKeyToDate(monthKey));
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState<Category>("Groceries");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<DraftLineItem[]>([]);

  const busy = stage === "uploading" || stage === "reading" || stage === "saving";

  function reset() {
    setStage("idle");
    setError(null);
    setSavedMessage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setIsPdf(false);
    setImagePath(null);
    setRawExtraction(null);
    setStoreName("");
    setDate(monthKeyToDate(monthKey));
    setTotal("");
    setCategory("Groceries");
    setNote("");
    setItems([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setError(null);
    setSavedMessage(null);

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("That file is larger than 15 MB. Try a photo instead of a scan.");
      return;
    }

    const supabase = createClient();
    setStage("uploading");
    let uploadedPath: string | null = null;

    try {
      const prepared = await prepareForUpload(file);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(prepared.blob));
      setIsPdf(prepared.mimeType === "application/pdf");

      const path = `${userId}/${crypto.randomUUID()}.${prepared.extension}`;
      const upload = await supabase.storage
        .from("receipts")
        .upload(path, prepared.blob, { contentType: prepared.mimeType, upsert: false });

      if (upload.error) throw new Error(upload.error.message);
      uploadedPath = path;
      setImagePath(path);

      setStage("reading");
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, monthKey }),
      });

      const payload = (await response.json()) as
        | { receipt: ExtractedReceipt }
        | { error: string };

      if (!response.ok || !("receipt" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Could not read that receipt.",
        );
      }

      applyDraft(payload.receipt);
      setStage("review");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
      // If the file made it to storage, drop into the review form anyway so the
      // details can be typed by hand rather than starting the upload again.
      setStage(uploadedPath ? "review" : "idle");
    }
  }

  function applyDraft(receipt: ExtractedReceipt) {
    setRawExtraction(receipt);
    setStoreName(receipt.store_name);
    setDate(receipt.date ?? monthKeyToDate(monthKey));
    setTotal(receipt.total ? String(receipt.total) : "");
    setCategory(receipt.category);
    setNote("");
    setItems(
      receipt.line_items.map((item, index) => ({
        key: `${index}-${item.item_name}`,
        item_name: item.item_name,
        amount: String(item.amount),
        quantity: item.quantity === null ? "" : String(item.quantity),
        category: item.category,
      })),
    );
  }

  /** Re-categorising the receipt re-homes items that still match the old one. */
  function changeCategory(next: Category) {
    setItems((current) =>
      current.map((item) => (item.category === category ? { ...item, category: next } : item)),
    );
    setCategory(next);
  }

  const itemsTotal = sum(items.map((item) => parseRand(item.amount)));
  const parsedTotal = parseRand(total);
  const difference = round2(parsedTotal - itemsTotal);

  async function handleSave(andAnother: boolean) {
    setError(null);
    setStage("saving");

    const result = await saveReceipt({
      monthKey,
      store_name: storeName.trim() || "Unknown store",
      date,
      total: parsedTotal,
      category,
      note: note.trim() || null,
      image_path: imagePath,
      raw_extraction: rawExtraction,
      line_items: items
        .filter((item) => item.item_name.trim().length > 0)
        .map((item) => ({
          item_name: item.item_name.trim(),
          amount: parseRand(item.amount),
          quantity: item.quantity.trim() ? parseRand(item.quantity) : null,
          category: item.category,
        })),
    });

    if (!result.ok) {
      setError(result.error);
      setStage("review");
      return;
    }

    if (andAnother) {
      const saved = storeName.trim() || "Receipt";
      reset();
      setSavedMessage(`${saved} saved. Ready for the next one.`);
      router.refresh();
      return;
    }

    router.push(`/?m=${monthKey}`);
    router.refresh();
  }

  if (stage === "idle" || stage === "uploading" || stage === "reading") {
    return (
      <div className="space-y-4">
        {savedMessage && (
          <p role="status" className="text-sm" style={{ color: "var(--good-ink)" }}>
            {savedMessage}
          </p>
        )}

        <label
          className="card flex cursor-pointer flex-col items-center gap-3 border-dashed px-6 py-10 text-center"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <span
            className="flex size-12 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
          >
            <CameraIcon />
          </span>
          <span className="font-medium">
            {stage === "uploading"
              ? "Uploading..."
              : stage === "reading"
                ? "Reading the receipt..."
                : "Take a photo or choose a file"}
          </span>
          <span className="text-sm text-ink-secondary">
            JPEG, PNG, WebP or PDF. Photos are shrunk before upload.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>

        {(stage === "uploading" || stage === "reading") && (
          <p className="text-center text-sm text-ink-muted" role="status">
            {stage === "reading"
              ? "This usually takes a few seconds."
              : "Sending the photo to your private storage."}
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rawExtraction?.notes && (
        <p
          className="card p-3 text-sm"
          style={{ borderColor: "var(--warning)" }}
          role="status"
        >
          <strong className="font-semibold">Worth a look: </strong>
          {rawExtraction.notes}
        </p>
      )}

      {rawExtraction && rawExtraction.confidence !== "high" && (
        <p className="text-sm text-ink-secondary">
          Read with {rawExtraction.confidence} confidence — check the amounts below.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {previewUrl && (
          <div className="card overflow-hidden">
            {isPdf ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-ink-secondary">
                <DocumentIcon />
                PDF uploaded.
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-accent underline underline-offset-4"
                >
                  Open it
                </a>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- a local
                 object URL for the file just picked; there is nothing to optimise. */
              <img
                src={previewUrl}
                alt="The receipt you uploaded"
                className="max-h-[60vh] w-full object-contain"
              />
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <div className="space-y-1.5">
              <label htmlFor="store" className="text-sm font-medium">
                Store
              </label>
              <input
                id="store"
                className="field"
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                placeholder="Checkers Hyper"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="date" className="text-sm font-medium">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  className="field"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="total" className="text-sm font-medium">
                  Total paid
                </label>
                <input
                  id="total"
                  className="field field-money"
                  inputMode="decimal"
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="category" className="text-sm font-medium">
                Category
              </label>
              <select
                id="category"
                className="field"
                value={category}
                onChange={(event) => changeCategory(event.target.value as Category)}
              >
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="note" className="text-sm font-medium">
                Note <span className="font-normal text-ink-muted">(optional)</span>
              </label>
              <input
                id="note"
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Paid partly with a gift card"
              />
            </div>
          </div>

          <LineItemEditor
            items={items}
            onChange={setItems}
            fallbackCategory={category}
            itemsTotal={itemsTotal}
            difference={difference}
          />

          {error && (
            <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void handleSave(false)}
            >
              {stage === "saving" ? "Saving..." : "Save receipt"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void handleSave(true)}
            >
              Save and add another
            </button>
            <button type="button" className="btn" disabled={busy} onClick={reset}>
              Start over
            </button>
          </div>

          <p className="text-xs text-ink-muted">
            Saving to {formatMonthLong(monthKey)} · {formatRand(parsedTotal)} total
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Prepared = { blob: Blob; mimeType: string; extension: string };

/**
 * Shrinks photos before upload: a modern phone camera produces several
 * megabytes at a resolution far beyond what is needed to read a till slip, and
 * a smaller file uploads faster on mobile data. PDFs pass through untouched.
 */
async function prepareForUpload(file: File): Promise<Prepared> {
  if (file.type === "application/pdf") {
    return { blob: file, mimeType: "application/pdf", extension: "pdf" };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Use a JPEG, PNG, WebP or PDF.");
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size <= 2 * 1024 * 1024 && isDirectlySupported(file.type)) {
      bitmap.close();
      return {
        blob: file,
        mimeType: file.type,
        extension: extensionFor(file.type),
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("could not encode");

    return { blob, mimeType: "image/jpeg", extension: "jpg" };
  } catch {
    if (isDirectlySupported(file.type)) {
      return { blob: file, mimeType: file.type, extension: extensionFor(file.type) };
    }
    throw new Error(
      "That image format could not be read. Take a photo with the camera, or convert it to JPEG first.",
    );
  }
}

function isDirectlySupported(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType);
}

function extensionFor(mimeType: string) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[
    mimeType
  ] ?? "jpg";
}

function CameraIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5A2 2 0 0 1 5 6.5h1.6a2 2 0 0 0 1.7-1l.5-.9a1 1 0 0 1 .9-.6h4.6a1 1 0 0 1 .9.6l.5.9a2 2 0 0 0 1.7 1H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}
