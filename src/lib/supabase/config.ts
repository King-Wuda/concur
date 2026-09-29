/**
 * Resolves the Supabase project credentials from the environment.
 *
 * Supabase now issues a "publishable" key (`sb_publishable_...`) in place of
 * the legacy `anon` JWT. Both are safe to ship to the browser and both go in
 * the same slot, so either environment variable name is accepted and the newer
 * one wins. Neither grants any access on its own - row level security decides
 * what a request can see, based on the session it carries.
 */

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  // Referenced by full name rather than looked up dynamically: Next.js inlines
  // NEXT_PUBLIC_* variables at build time only where it can see them literally.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key);
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill in your Supabase project details.`,
    );
  }
  return value;
}
