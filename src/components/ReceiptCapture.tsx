"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { saveReceipt } from "@/app/actions";
import {
  ExpenseFields,
  emptyExpense,
  expensePayload,
  filingMonth,
  type ExpenseValues,
} from "@/components/ExpenseForm";
import { CATEGORY_COLOR_VAR } from "@/lib/categories";
import { formatRand, parseRand, sum } from "@/lib/money";
import { useMonthStarts } from "@/components/BudgetCalendar";
import { formatMonthLong, type MonthKey } from "@/lib/month";
import { defaultDateIn, type MonthStart } from "@/lib/period";
import { createClient } from "@/lib/supabase/client";
import type { ExtractedReceipt } from "@/lib/types";

/**
 * The capture flow, for one receipt or a pile of them.
 *
 * Pick several files at once (or snap photos one after another), and each is
 * uploaded and read in parallel while you watch. They come back as a list of
 * drafts to check - tap one to correct it - and "Save all" files the lot. Then
 * it asks whether there is another receipt to add, rather than dropping you on
 * the dashboard mid-pile.
 *
 * Every file goes straight from the browser to private storage; only its path
 * is sent to the server to be read, which keeps big phone photos out of the
 * serverless request body. Nothing reaches the budget until "Save all".
 */

type Phase = "pick" | "review" | "done";

type Status = "uploading" | "reading" | "ready" | "failed" | "saving" | "saved";

type Entry = {
  key: string;
  fileName: string;
  previewUrl: string | null;
  isPdf: boolean;
  status: Status;
  /** Set once the file is in storage; cleaned up if the entry is discarded. */
  imagePath: string | null;
  extraction: ExtractedReceipt | null;
  values: ExpenseValues;
  error: string | null;
  /** The receipt showed no date, so one was filled in - and needs a look. */
  dateMissing: boolean;
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;
/** A pile, not a shoebox: enough for a week of slips, few enough to check. */
const MAX_BATCH = 20;
/**
 * How many receipts are read at once. Each takes a few seconds; three in
 * parallel clears a pile quickly without tripping the API's rate limit.
 */
const READ_CONCURRENTLY = 3;

export function ReceiptCapture({
  monthKey,
  userId,
}: {
  monthKey: MonthKey;
  userId: string;
}) {
  const router = useRouter();
  const starts = useMonthStarts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // The original File for each entry, so a failed one can be retried.
  const filesRef = useRef(new Map<string, File>());

  const [phase, setPhase] = useState<Phase>("pick");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saved, setSaved] = useState<{ name: string; total: number; month: MonthKey }[]>(
    [],
  );
  const [unreadSkipped, setUnreadSkipped] = useState(0);

  const update = (key: string, patch: Partial<Entry>) =>
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)),
    );

  const inFlight = entries.some((e) => e.status === "uploading" || e.status === "reading");
  const ready = entries.filter((e) => e.status === "ready");
  const readyTotal = sum(ready.map((e) => parseRand(e.values.total)));
  const room = MAX_BATCH - entries.filter((e) => e.status !== "saved").length;

  function clearInputs() {
    // Clear both, or picking the same file twice in a row fires no change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  /** Drops an entry, and its stored file if the receipt was never saved. */
  function discard(entry: Entry) {
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    filesRef.current.delete(entry.key);
    if (entry.imagePath && entry.status !== "saved") {
      // Best effort: an orphaned file is untidy, not worth failing over.
      void createClient().storage.from("receipts").remove([entry.imagePath]);
    }
  }

  function remove(key: string) {
    const entry = entries.find((e) => e.key === key);
    if (entry) discard(entry);
    const rest = entries.filter((e) => e.key !== key);
    setEntries(rest);
    if (openKey === key) setOpenKey(null);
    if (rest.length === 0) setPhase("pick");
  }

  function startOver() {
    for (const entry of entries) discard(entry);
    setEntries([]);
    setOpenKey(null);
    setNotice(null);
    setSaved([]);
    setUnreadSkipped(0);
    setPhase("pick");
    clearInputs();
  }

  async function handleFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    clearInputs();
    if (files.length === 0) return;

    setNotice(null);
    const accepted = files.slice(0, Math.max(room, 0));
    if (accepted.length < files.length) {
      setNotice(
        `${MAX_BATCH} receipts at a time — ${
          accepted.length === 0 ? "none" : `the first ${accepted.length}`
        } of those were added. Save these, then add the rest.`,
      );
    }
    if (accepted.length === 0) return;

    const fresh: Entry[] = accepted.map((file) => ({
      key: crypto.randomUUID(),
      fileName: file.name || "Photo",
      previewUrl: null,
      isPdf: file.type === "application/pdf",
      status: "uploading",
      imagePath: null,
      extraction: null,
      values: emptyExpense(monthKey, starts),
      error: null,
      dateMissing: false,
    }));
    fresh.forEach((entry, index) => filesRef.current.set(entry.key, accepted[index]));

    // A single receipt opens straight into its form, as one always did.
    if (entries.length === 0 && fresh.length === 1) setOpenKey(fresh[0].key);

    setEntries((current) => [...current, ...fresh]);
    setPhase("review");

    await runPool(
      fresh.map((entry) => () => processEntry(entry.key)),
      READ_CONCURRENTLY,
    );
  }

  /** Upload one file, then have it read. Never throws: failure lands on the entry. */
  async function processEntry(key: string) {
    const file = filesRef.current.get(key);
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      update(key, {
        status: "failed",
        error: "Larger than 15 MB. Try a photo of it instead of a scan.",
      });
      return;
    }

    update(key, { status: "uploading", error: null });
    let path: string | null = null;

    try {
      const prepared = await prepareForUpload(file);
      update(key, {
        previewUrl: URL.createObjectURL(prepared.blob),
        isPdf: prepared.mimeType === "application/pdf",
      });

      path = `${userId}/${crypto.randomUUID()}.${prepared.extension}`;
      const upload = await createClient()
        .storage.from("receipts")
        .upload(path, prepared.blob, { contentType: prepared.mimeType, upsert: false });
      if (upload.error) throw new Error(upload.error.message);

      update(key, { imagePath: path, status: "reading" });

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, monthKey }),
      });
      const payload = (await response.json()) as
        | { receipt: ExtractedReceipt }
        | { error: string };

      if (!response.ok || !("receipt" in payload)) {
        throw new Error("error" in payload ? payload.error : "Could not read that receipt.");
      }

      update(key, {
        status: "ready",
        extraction: payload.receipt,
        values: toDraft(payload.receipt, monthKey, starts),
        dateMissing: payload.receipt.date === null,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Something went wrong.";
      if (path) {
        // The file is safely stored, so keep it and let the details be typed
        // in by hand rather than making them upload it again.
        update(key, { status: "ready", error: `${message} Fill this one in by hand.` });
      } else {
        update(key, { status: "failed", error: message });
      }
    }
  }

  async function saveAll() {
    const pending = entries.filter((e) => e.status === "ready");
    if (pending.length === 0) return;

    // Catch the one that would save as "Unknown store, R0.00" before any are saved.
    const blank = pending.find((e) => parseRand(e.values.total) === 0);
    if (blank) {
      setOpenKey(blank.key);
      update(blank.key, { error: "Enter the total paid before saving." });
      return;
    }

    setSavingAll(true);
    setNotice(null);
    const done: { name: string; total: number; month: MonthKey }[] = [];
    const failedKeys: string[] = [];

    // One at a time, in the order shown, so a failure is easy to point at.
    for (const entry of pending) {
      update(entry.key, { status: "saving", error: null });
      const result = await saveReceipt(
        expensePayload(entry.values, {
          imagePath: entry.imagePath,
          rawExtraction: entry.extraction,
        }),
      );
      if (result.ok) {
        update(entry.key, { status: "saved" });
        done.push({
          name: entry.values.storeName.trim() || "Unknown store",
          total: parseRand(entry.values.total),
          month: filingMonth(entry.values, monthKey, starts),
        });
      } else {
        failedKeys.push(entry.key);
        update(entry.key, { status: "ready", error: result.error });
      }
    }

    setSavingAll(false);
    router.refresh();
    setSaved((previous) => [...previous, ...done]);

    if (failedKeys.length > 0) {
      // Saved ones stay listed as saved; open the first that was not.
      setOpenKey(failedKeys[0]);
      setNotice(
        `${done.length} saved, ${failedKeys.length} could not be — ${
          failedKeys.length === 1 ? "it is" : "they are"
        } still below with the reason. Press save again once fixed.`,
      );
      return;
    }

    // Anything that never uploaded was shown as failed and is not coming back.
    const unread = entries.filter((e) => e.status === "failed");
    setUnreadSkipped(unread.length);
    for (const entry of entries) {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    }
    filesRef.current.clear();
    setEntries([]);
    setOpenKey(null);
    setPhase("done");
  }

  /* ---------------------------------------------------------------- done -- */

  if (phase === "done") {
    const total = sum(saved.map((s) => s.total));
    const months = [...new Set(saved.map((s) => s.month))].sort();
    const monthsText =
      months.length <= 1
        ? formatMonthLong(months[0] ?? monthKey)
        : `${months.slice(0, -1).map(formatMonthLong).join(", ")} and ${formatMonthLong(
            months[months.length - 1],
          )}`;
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="card space-y-4 p-5 text-center">
          <span
            className="mx-auto flex size-12 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--good) 16%, transparent)" }}
          >
            <CheckIcon />
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold" role="status">
              {saved.length === 1 ? "Expense saved" : `${saved.length} expenses saved`}
            </h2>
            <p className="text-sm text-ink-secondary">
              {formatRand(total)} added to {monthsText}.
            </p>
          </div>

          {saved.length > 1 && (
            <ul className="divide-y divide-[var(--border)] text-left text-sm">
              {saved.map((s, index) => (
                <li key={index} className="flex justify-between gap-3 py-1.5">
                  <span className="truncate">
                    {s.name}
                    {months.length > 1 && (
                      <span className="text-ink-muted"> · {formatMonthLong(s.month)}</span>
                    )}
                  </span>
                  <span className="tabular">{formatRand(s.total)}</span>
                </li>
              ))}
            </ul>
          )}

          {unreadSkipped > 0 && (
            <p className="text-sm text-ink-secondary">
              {unreadSkipped === 1
                ? "1 file could not be uploaded and was not saved."
                : `${unreadSkipped} files could not be uploaded and were not saved.`}
            </p>
          )}
        </div>

        <div className="card space-y-3 p-5 text-center">
          <p className="font-medium">Add another receipt?</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSaved([]);
                setUnreadSkipped(0);
                setPhase("pick");
              }}
            >
              Yes, add another
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => router.push(`/?m=${monthKey}`)}
            >
              No, go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- pick -- */

  const pickers = (primaryLabel: string, compact: boolean) => (
    <>
      <label
        className={`btn ${compact ? "" : "btn-primary"} ${
          savingAll ? "pointer-events-none opacity-55" : ""
        }`}
      >
        {primaryLabel}
        <input
          ref={fileInputRef}
          type="file"
          /* No `capture`: this is the one that reaches the gallery, the files
             app, and anything already saved on the device. `multiple` lets a
             whole pile be chosen in one go. */
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          disabled={savingAll}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </label>

      <label
        className={`btn touch-only ${savingAll ? "pointer-events-none opacity-55" : ""}`}
      >
        <CameraIcon />
        Take a photo
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={savingAll}
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </label>
    </>
  );

  const dropProps = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!savingAll) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      if (!savingAll) void handleFiles(event.dataTransfer.files);
    },
  };

  if (phase === "pick") {
    return (
      <div className="space-y-4">
        {/*
          Picking and photographing are separate inputs, because one cannot do
          both: a file input carrying `capture` tells a phone to open the camera
          and nothing else - no gallery, no screenshots - which is useless for a
          trip or an order already in the camera roll. The camera button shows
          only on a device that has one to point.
        */}
        <div
          className={`card flex flex-col items-center gap-3 border-dashed px-6 py-8 text-center ${
            dragging ? "ring-2" : ""
          }`}
          style={{
            borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
            background: dragging
              ? "color-mix(in srgb, var(--accent) 6%, transparent)"
              : undefined,
          }}
          {...dropProps}
        >
          <span
            className="flex size-12 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}
          >
            <ReceiptPlusIcon />
          </span>
          <span className="font-medium">Add receipts</span>
          <span className="text-sm text-ink-secondary">
            Photos, screenshots or PDFs — pick as many as you like, up to {MAX_BATCH}.
            Each one is read for you, and nothing is saved until you check them.
          </span>

          <div className="flex w-full flex-wrap justify-center gap-2 pt-1">
            {pickers("Choose photos or files", false)}
          </div>

          <span className="hidden text-xs text-ink-muted sm:block">or drop files here</span>
        </div>

        {notice && (
          <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
            {notice}
          </p>
        )}
      </div>
    );
  }

  /* -------------------------------------------------------------- review -- */

  const readingCount = entries.filter(
    (e) => e.status === "uploading" || e.status === "reading",
  ).length;

  return (
    <div className="space-y-4" {...dropProps}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {entries.length === 1 ? "Check the receipt" : `Check ${entries.length} receipts`}
        </h2>
        <p className="text-sm text-ink-secondary" role="status" aria-live="polite">
          {readingCount > 0
            ? `Reading ${readingCount} of ${entries.length}…`
            : "Tap one to correct it."}
        </p>
      </header>

      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <EntryCard
            key={entry.key}
            entry={entry}
            index={index}
            monthKey={monthKey}
            open={openKey === entry.key}
            locked={savingAll}
            onToggle={() =>
              setOpenKey((current) => (current === entry.key ? null : entry.key))
            }
            onChange={(values) =>
              update(entry.key, {
                values,
                error: null,
                // Touching the date answers the question it was asking.
                dateMissing: entry.dateMissing && values.date === entry.values.date,
              })
            }
            onRemove={() => remove(entry.key)}
            onRetry={() => void processEntry(entry.key)}
          />
        ))}
      </ul>

      {notice && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {notice}
        </p>
      )}

      <div className="sticky bottom-16 z-10 space-y-3 rounded-xl border border-line bg-surface p-3 shadow-lg sm:bottom-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingAll || inFlight || ready.length === 0}
            onClick={() => void saveAll()}
          >
            {savingAll
              ? "Saving..."
              : inFlight
                ? "Reading…"
                : ready.length === 1
                  ? `Save expense · ${formatRand(readyTotal)}`
                  : `Save all ${ready.length} · ${formatRand(readyTotal)}`}
          </button>

          {room > 0 && pickers("Add more", true)}

          <button
            type="button"
            className="btn ml-auto"
            disabled={savingAll}
            onClick={startOver}
          >
            Start over
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          Each is saved to the month on its own date. Nothing is saved until you
          press save.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------- */

function EntryCard({
  entry,
  index,
  monthKey,
  open,
  locked,
  onToggle,
  onChange,
  onRemove,
  onRetry,
}: {
  entry: Entry;
  index: number;
  monthKey: MonthKey;
  open: boolean;
  locked: boolean;
  onToggle: () => void;
  onChange: (values: ExpenseValues) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const { status, values, extraction } = entry;
  const lands = filingMonth(values, monthKey, useMonthStarts());
  const otherMonth = status !== "uploading" && status !== "reading" && lands !== monthKey;
  const busy = status === "uploading" || status === "reading" || status === "saving";
  const editable = status === "ready" && !locked;
  const needsLook =
    status === "ready" &&
    (entry.error !== null ||
      entry.dateMissing ||
      Boolean(extraction?.notes) ||
      (extraction !== null && extraction.confidence !== "high"));

  const subtitle =
    status === "uploading"
      ? "Uploading…"
      : status === "reading"
        ? "Reading…"
        : status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved"
            : status === "failed"
              ? "Could not be uploaded"
              : `${values.date} · ${values.category}${
                  values.items.length > 0
                    ? ` · ${values.items.length} item${values.items.length === 1 ? "" : "s"}`
                    : ""
                }`;

  return (
    <li className="card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default"
        aria-expanded={open}
        disabled={!editable}
        onClick={onToggle}
      >
        <Thumb entry={entry} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {status === "ready" && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ background: CATEGORY_COLOR_VAR[values.category] }}
              />
            )}
            <span className="truncate font-medium">
              {status === "ready" || status === "saving" || status === "saved"
                ? values.storeName || "Untitled"
                : entry.fileName}
            </span>
          </span>
          <span
            className="block truncate text-xs"
            style={{
              color:
                status === "failed"
                  ? "var(--critical)"
                  : status === "saved"
                    ? "var(--good-ink)"
                    : "var(--ink-muted)",
            }}
          >
            {subtitle}
          </span>
          {otherMonth && status !== "failed" && (
            <span className="mt-0.5 block text-xs font-medium text-ink-secondary">
              Goes to {formatMonthLong(lands)}
            </span>
          )}
          {needsLook && !open && (
            <span className="mt-0.5 block text-xs font-medium" style={{ color: "var(--serious)" }}>
              Check this one
            </span>
          )}
        </span>

        {(status === "ready" || status === "saving" || status === "saved") && (
          <span className="tabular font-semibold">{formatRand(parseRand(values.total))}</span>
        )}
        {busy && <Spinner />}
        {editable && <Chevron open={open} />}
      </button>

      {status === "failed" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
          <p className="mr-auto text-sm" style={{ color: "var(--critical)" }}>
            {entry.error}
          </p>
          <button type="button" className="btn !min-h-9 !px-3 !py-1.5 !text-sm" onClick={onRetry}>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-danger !min-h-9 !px-3 !py-1.5 !text-sm"
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      )}

      {open && editable && (
        <div className="space-y-4 border-t border-line p-4">
          {entry.error && (
            <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
              {entry.error}
            </p>
          )}
          {entry.dateMissing && (
            <p className="card p-3 text-sm" style={{ borderColor: "var(--warning)" }}>
              <strong className="font-semibold">No date on this receipt. </strong>
              {values.date} was filled in — change it if that is not when you paid,
              since the date decides which month it counts against.
            </p>
          )}
          {extraction?.notes && (
            <p className="card p-3 text-sm" style={{ borderColor: "var(--warning)" }}>
              <strong className="font-semibold">Worth a look: </strong>
              {extraction.notes}
            </p>
          )}
          {extraction && extraction.confidence !== "high" && (
            <p className="text-sm text-ink-secondary">
              Read with {extraction.confidence} confidence — check the amounts.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            {entry.previewUrl && (
              <div className="card self-start overflow-hidden">
                {entry.isPdf ? (
                  <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-ink-secondary">
                    <DocumentIcon />
                    PDF uploaded.
                    <a
                      href={entry.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent underline underline-offset-4"
                    >
                      Open it
                    </a>
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- a local
                     object URL for the file just picked; nothing to optimise. */
                  <img
                    src={entry.previewUrl}
                    alt={`Receipt ${index + 1}`}
                    className="max-h-[50vh] w-full object-contain"
                  />
                )}
              </div>
            )}

            <ExpenseFields
              values={values}
              onChange={onChange}
              idPrefix={`r${index}-`}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={onToggle}>
              Done
            </button>
            <button type="button" className="btn btn-danger ml-auto" onClick={onRemove}>
              Remove from this batch
            </button>
          </div>
          <p className="text-xs text-ink-muted">
            Will be saved to {formatMonthLong(lands)}, the pay period its date falls in.
          </p>
        </div>
      )}
    </li>
  );
}

function Thumb({ entry }: { entry: Entry }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunken">
      {entry.previewUrl && !entry.isPdf ? (
        /* eslint-disable-next-line @next/next/no-img-element -- local object URL */
        <img src={entry.previewUrl} alt="" className="size-full object-cover" />
      ) : (
        <DocumentIcon />
      )}
    </span>
  );
}

/** Runs async jobs with at most `limit` in flight at once. */
async function runPool(jobs: (() => Promise<void>)[], limit: number) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];
      next += 1;
      await job();
    }
  });
  await Promise.all(workers);
}

function Spinner() {
  return (
    <svg
      className="size-4 shrink-0 animate-spin text-ink-muted"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-ink-muted"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--good-ink)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

function toDraft(
  receipt: ExtractedReceipt,
  monthKey: MonthKey,
  starts: readonly MonthStart[],
): ExpenseValues {
  return {
    storeName: receipt.store_name,
    // A dateless receipt gets today (or the edge of a month that is not
    // running); the card then says so, because the date decides which month it
    // counts against.
    date: receipt.date ?? defaultDateIn(monthKey, starts),
    total: receipt.total ? String(receipt.total) : "",
    category: receipt.category,
    note: "",
    items: receipt.line_items.map((item, index) => ({
      key: `${index}-${item.item_name}`,
      item_name: item.item_name,
      amount: String(item.amount),
      quantity: item.quantity === null ? "" : String(item.quantity),
      category: item.category,
    })),
  };
}

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

/** The empty-state glyph: a slip with a plus, not a camera, now that choosing
 *  a file is the main route in. */
function ReceiptPlusIcon() {
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
      <path d="M13 3H6.5v18l2.6-1.4 2.6 1.4 1.3-0.7" />
      <path d="M9.5 8h5M9.5 11.5h3" />
      <circle cx="17.5" cy="16.5" r="4.2" />
      <path d="M17.5 14.6v3.8M15.6 16.5h3.8" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
