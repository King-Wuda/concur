import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { resolveMonth } from "@/lib/data";
import { createClient, getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Budget",
  description:
    "Personal monthly budgeting in rand: scan a receipt, categorise the spend, track it against the plan.",
  applicationName: "Budget",
  appleWebApp: { capable: true, title: "Budget", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Opened from the home screen, the page runs edge to edge; the bottom nav
  // pads itself with env(safe-area-inset-bottom) to clear the home indicator,
  // which only has a value with viewport-fit=cover.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

/**
 * Applies the saved theme before first paint, so a dark-mode reload does not
 * flash a light screen.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}}catch(e){}`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  // The pay period running today, which the header shows when no month is
  // picked. Best effort: the header is no reason to fail the whole page.
  const currentKey = user
    ? await resolveMonth(await createClient(), user.id, null)
        .then((r) => r.currentKey)
        .catch(() => null)
    : null;

  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* AppShell reads the `m` search param, which needs a boundary. */}
        <Suspense fallback={null}>
          <AppShell userEmail={user?.email ?? null} currentKey={currentKey}>
            {children}
          </AppShell>
        </Suspense>
      </body>
    </html>
  );
}
