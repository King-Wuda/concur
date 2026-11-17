const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 – 27 Dec 2026", "28 Dec 2026 – 3 Jan 2027", "20 Dec 2026", or null. */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const part = (iso: string, withMonth: boolean, withYear: boolean) => {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d}${withMonth ? ` ${MONTHS[m - 1]}` : ""}${withYear ? ` ${y}` : ""}`;
  };
  if (start && end && start !== end) {
    const sameYear = start.slice(0, 4) === end.slice(0, 4);
    const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
    return `${part(start, !sameMonth, !sameYear)} – ${part(end, true, true)}`;
  }
  const one = start ?? end;
  return one ? part(one, true, true) : null;
}
