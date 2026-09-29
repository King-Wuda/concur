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

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: ownerEmail(),
    password,
  });

  if (error) {
    // Deliberately vague, and identical for every failure: there is one
    // account, so anything more specific only helps someone guessing.
    return { error: "That password is not right." };
  }

  redirect(next);
}
