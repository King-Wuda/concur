"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Mode = "link" | "password";

/**
 * Two ways in, because a personal deployment should not be locked out by email
 * delivery: a magic link, or an email and password. Both go through Supabase
 * auth; the app never sees or stores a password itself.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<Mode>("link");
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // An expired or already-used magic link comes back as ?error=...
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    setBusy(false);
    if (error) setError(error.message);
    else setMessage(`Check ${email.trim()} for a sign-in link.`);
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const credentials = { email: email.trim(), password };

    const { data, error } = isSignUp
      ? await supabase.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        })
      : await supabase.auth.signInWithPassword(credentials);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    if (isSignUp && !data.session) {
      setMessage("Account created. Confirm your email address, then sign in.");
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <div className="card space-y-4 p-5">
      <div
        role="tablist"
        aria-label="Sign-in method"
        className="flex gap-1 rounded-lg bg-sunken p-1"
      >
        {(
          [
            ["link", "Magic link"],
            ["password", "Password"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={mode === "link" ? sendMagicLink : submitPassword} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {mode === "password" && (
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              className="field"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy
            ? "Working..."
            : mode === "link"
              ? "Email me a sign-in link"
              : isSignUp
                ? "Create account"
                : "Sign in"}
        </button>

        {mode === "password" && (
          <button
            type="button"
            onClick={() => {
              setIsSignUp((value) => !value);
              setError(null);
              setMessage(null);
            }}
            className="w-full text-sm text-ink-secondary underline underline-offset-4"
          >
            {isSignUp ? "I already have an account" : "Create an account instead"}
          </button>
        )}
      </form>

      {message && (
        <p role="status" className="text-sm" style={{ color: "var(--good-ink)" }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
