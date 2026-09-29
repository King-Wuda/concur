import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { getUser } from "@/lib/supabase/server";

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

  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* AppShell reads the `m` search param, which needs a boundary. */}
        <Suspense fallback={null}>
          <AppShell userEmail={user?.email ?? null}>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
