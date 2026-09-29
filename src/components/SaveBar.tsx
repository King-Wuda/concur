"use client";

/** Save button plus its status line, shared by the Plan forms. */
export function SaveBar({
  status,
  error,
  onSave,
  label = "Save",
  children,
}: {
  status: "idle" | "saving" | "saved";
  error: string | null;
  onSave: () => void | Promise<void>;
  label?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
      <button
        type="button"
        className="btn btn-primary"
        disabled={status === "saving"}
        onClick={() => void onSave()}
      >
        {status === "saving" ? "Saving..." : label}
      </button>

      {children}

      {status === "saved" && !error && (
        <span role="status" className="text-sm" style={{ color: "var(--good-ink)" }}>
          Saved.
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
