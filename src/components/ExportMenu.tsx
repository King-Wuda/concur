import type { MonthKey } from "@/lib/month";
import { formatMonthShort } from "@/lib/month";

/** Plain links - the browser handles the download, no client JavaScript needed. */
export function ExportMenu({ monthKey }: { monthKey: MonthKey }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a className="btn" href={`/api/export?m=${monthKey}&scope=month`} download>
        <DownloadIcon />
        Export {formatMonthShort(monthKey)}
      </a>
      <a className="btn" href="/api/export?scope=all" download>
        <DownloadIcon />
        Export everything
      </a>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  );
}
