import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Request-scoped Supabase client for server components, route handlers and
 * server actions. Every query runs as the signed-in user, so row level
 * security - not application code - is what keeps one user's data private.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server components cannot set cookies. The middleware refreshes
            // the session on every request, so it is safe to ignore here.
          }
        },
      },
    },
  );
}

/** The signed-in user, or null. */
export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
