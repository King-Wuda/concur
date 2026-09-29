"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Browser-side Supabase client. Used for auth and for uploading receipt files
 * straight to storage, which keeps large phone photos out of the serverless
 * function request body.
 */
export function createClient() {
  return createBrowserClient(
    supabaseUrl(),
    supabasePublishableKey(),
  );
}
