"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { currentMonthKey, formatMonthShort, normaliseMonthKey } from "@/lib/month";

/**
 * Header, navigation and page frame. The month currently being worked on lives
 * in the `m` query parameter, and every nav link carries it forward so
 * switching tabs never loses your place.
 */

const TABS = [
  { href: "/", label: "Dashboard", icon: ChartIcon },
  { href: "/capture", label: "Add", icon: CameraIcon },
  { href: "/receipts", label: "Receipts", icon: ReceiptIcon },
  { href: "/plan", label: "Plan", icon: SlidersIcon },
] as const;

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const monthKey = normaliseMonthKey(searchParams.get("m") ?? undefined);

  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth");

  if (isAuthPage || !userEmail) {
    return <main className="mx-auto w-full max-w-md px-4 py-10">{children}</main>;
  }

  const withMonth = (href: string) =>
    monthKey === currentMonthKey() ? href : `${href}?m=${monthKey}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link href={withMonth("/")} className="flex items-center gap-2 font-semibold">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            Budget
          </Link>
          <span className="text-sm text-ink-muted tabular">
            {formatMonthShort(monthKey)}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-sm text-ink-secondary hover:text-ink"
                title={`Signed in as ${userEmail}`}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        <nav
          aria-label="Sections"
          className="mx-auto hidden w-full max-w-5xl gap-1 px-4 pb-2 sm:flex"
        >
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={withMonth(tab.href)}
              aria-current={isActive(pathname, tab.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                isActive(pathname, tab.href)
                  ? "bg-sunken text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-4 sm:pb-10">
        {children}
      </main>

      {/* Thumb-reachable navigation on a phone. */}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="mx-auto flex max-w-lg">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={withMonth(tab.href)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium ${
                    active ? "text-accent" : "text-ink-muted"
                  }`}
                >
                  <Icon />
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Theme toggle with no React state: the icon that shows is decided by CSS from
 * the same signals that theme the page, so there is nothing to hydrate and no
 * flash of the wrong icon on load.
 */
function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const isDark = getComputedStyle(root).colorScheme === "dark";
    const next = isDark ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing; the choice just will not persist.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg px-2 py-1.5 text-sm text-ink-secondary hover:text-ink"
      aria-label="Toggle dark mode"
    >
      <span className="only-light">
        <MoonIcon />
      </span>
      <span className="only-dark">
        <SunIcon />
      </span>
    </button>
  );
}

/* Icons: 1.5px strokes, currentColor, so they stay recessive next to the data. */

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 20V10m6 10V4m6 16v-7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h1.6a2 2 0 0 0 1.7-1l.5-.9a1 1 0 0 1 .9-.6h4.6a1 1 0 0 1 .9.6l.5.9a2 2 0 0 0 1.7 1H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 3h12v18l-3-1.6-3 1.6-3-1.6L6 21Z" />
      <path d="M9.5 8h5M9.5 12h5" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M18.4 5.6l-1 1M6.6 17.4l-1 1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
