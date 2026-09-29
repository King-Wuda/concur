"use server";

import { redirect } from "next/navigation";

import { ownerEmail } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs in the single account this app belongs to.
 *
 * The password is checked by Supabase against its stored hash - it is never
 * compared in application code and never appears in this repository, so
 * changing it means changing it in Supabase, not shipping a new deploy.
 */

export type SignInState = { error: string | null };

export async function signIn(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const password = String(formData.get("password") ?? "");
  const requested = String(formData.get("next") ?? "/");
  // Only ever an in-app path, so a crafted link cannot bounce elsewhere.
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (!password) {
    return { error: "Enter your password." };
  }

  // A missing environment variable throws here rather than returning an error,
  // and an uncaught throw in a server action renders the browser's blank
  // "a server error occurred" page - which says nothing about what to fix, on
  // the one screen where there is nobody signed in to read a log. Catching it
  // turns a dead end into an instruction. The redirect stays outside: it works
  // by throwing, and must not be swallowed here.
  let failed: boolean;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: ownerEmail(),
      password,
    });
    failed = error !== null;
  } catch (cause) {
    console.error("Sign-in could not be attempted", cause);
    return {
      error:
        cause instanceof Error
          ? cause.message
          : "Sign-in is not configured. Check the environment variables.",
    };
  }

  if (failed) {
    // Deliberately vague, and identical for every wrong attempt: there is one
    // account, so anything more specific only helps someone guessing.
    return { error: "That password is not right." };
  }

  redirect(next);
}
