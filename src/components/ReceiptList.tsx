"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteReceipt, signedReceiptUrl, updateReceipt } from "@/app/actions";
import { LineItemEditor, type DraftLineItem } from "@/components/LineItemEditor";
import { CATEGORIES, CATEGORY_COLOR_VAR, type Category } from "@/lib/categories";
import { formatRand, parseRand, round2, sum } from "@/lib/money";
import type { ReceiptWithItems } from "@/lib/types";

/**
 * The month's receipts. Each row expands into an editor, so a category the
 * model got wrong can be fixed in two taps without leaving the list.
 */
export function ReceiptList({ receipts }: { receipts: ReceiptWithItems[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="space-y-2">
      {receipts.map((receipt) => (
        <li key={receipt.id} className="card overflow-hidden">
          <button
            type="button"
            className="flex w-full items-center gap-3 p-4 text-left"
            aria-expanded={openId === receipt.id}
            onClick={() => setOpenId((current) => (current === receipt.id ? null : receipt.id))}
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-sm"
              style={{ background: CATEGORY_COLOR_VAR[receipt.category] }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{receipt.store_name}</span>
              <span className="text-xs text-ink-muted">
                {receipt.date} · {receipt.category} · {receipt.line_items.length} item
                {receipt.line_items.length === 1 ? "" : "s"}
              </span>
            </span>
            <span className="tabular font-semibold">{formatRand(Number(receipt.total))}</span>
            <Chevron open={openId === receipt.id} />
          </button>

          {openId === receipt.id && (
            <ReceiptEditor receipt={receipt} onClose={() => setOpenId(null)} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ReceiptEditor({
  receipt,
  onClose,
}: {
  receipt: ReceiptWithItems;
  onClose: () => void;
}) {
  const router = useRouter();

  const [storeName, setStoreName] = useState(receipt.store_name);
  const [date, setDate] = useState(receipt.date);
  const [total, setTotal] = useState(String(round2(Number(receipt.total) || 0)));
  const [category, setCategory] = useState<Category>(receipt.category);
  const [note, setNote] = useState(receipt.note ?? "");
  const [items, setItems] = useState<DraftLineItem[]>(() =>
    receipt.line_items.map((item) => ({
      key: item.id,
      item_name: item.item_name,
      amount: String(round2(Number(item.amount) || 0)),
      quantity: item.quantity === null ? "" : String(item.quantity),
      category: item.category,
    })),
  );

  const [busy, setBusy] = useState<"save" | "delete" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const itemsTotal = sum(items.map((item) => parseRand(item.amount)));
  const parsedTotal = parseRand(total);

  async function save() {
    setBusy("save");
    setError(null);

    const result = await updateReceipt({
      id: receipt.id,
      store_name: storeName.trim() || "Unknown store",
      date,
      total: parsedTotal,
      category,
      note: note.trim() || null,
      line_items: items
        .filter((item) => item.item_name.trim().length > 0)
        .map((item) => ({
          item_name: item.item_name.trim(),
          amount: parseRand(item.amount),
          quantity: item.quantity.trim() ? parseRand(item.quantity) : null,
          category: item.category,
        })),
    });

    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    onClose();
    router.refresh();
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const result = await deleteReceipt(receipt.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function openImage() {
    if (!receipt.image_path) return;
    setBusy("image");
    setError(null);
    const result = await signedReceiptUrl(receipt.image_path);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor={`store-${receipt.id}`} className="text-sm font-medium">
            Store
          </label>
          <input
            id={`store-${receipt.id}`}
            className="field"
            value={storeName}
            onChange={(event) => setStoreName(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`date-${receipt.id}`} className="text-sm font-medium">
            Date
          </label>
          <input
            id={`date-${receipt.id}`}
            type="date"
            className="field"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`total-${receipt.id}`} className="text-sm font-medium">
            Total paid
          </label>
          <input
            id={`total-${receipt.id}`}
            className="field field-money"
            inputMode="decimal"
            value={total}
            onChange={(event) => setTotal(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`category-${receipt.id}`} className="text-sm font-medium">
            Category
          </label>
          <select
            id={`category-${receipt.id}`}
            className="field"
            value={category}
            onChange={(event) => {
              const next = event.target.value as Category;
              setItems((current) =>
                current.map((item) =>
                  item.category === category ? { ...item, category: next } : item,
                ),
              );
              setCategory(next);
            }}
          >
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`note-${receipt.id}`} className="text-sm font-medium">
            Note
          </label>
          <input
            id={`note-${receipt.id}`}
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <LineItemEditor
        items={items}
        onChange={setItems}
        fallbackCategory={category}
        itemsTotal={itemsTotal}
        difference={round2(parsedTotal - itemsTotal)}
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
          disabled={busy !== null}
          onClick={() => void save()}
        >
          {busy === "save" ? "Saving..." : "Save changes"}
        </button>

        {receipt.image_path && (
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => void openImage()}
          >
            {busy === "image" ? "Opening..." : "View original"}
          </button>
        )}

        <button type="button" className="btn" disabled={busy !== null} onClick={onClose}>
          Cancel
        </button>

        {confirmDelete ? (
          <span className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy !== null}
              onClick={() => void remove()}
            >
              {busy === "delete" ? "Deleting..." : "Yes, delete it"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-danger ml-auto"
            disabled={busy !== null}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
      </div>
    </div>
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
