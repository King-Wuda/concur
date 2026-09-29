"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/app/login/actions";

/**
 * The whole sign-in screen: one password field.
 *
 * There is exactly one account, so there is nothing to choose between and no
 * account to create. The password goes straight to Supabase, which checks it
 * against its stored hash; this app never sees a hash and never holds the
 * password anywhere.
 */
export function PasswordForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {
    error: null,
  });

  return (
    <form action={formAction} className="card space-y-4 p-5">
      <input type="hidden" name="next" value={next} />

      {/*
        Password managers key a saved password to a username field, and browsers
        warn when one is missing. There is only ever one account here, so this is
        a fixed label rather than anything typed - and deliberately not the
        account's email address, which stays server-side.
      */}
      <input
        type="text"
        name="username"
        value="budget"
        autoComplete="username"
        readOnly
        hidden
        aria-hidden
        tabIndex={-1}
      />

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          className="field"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state.error ? "password-error" : undefined}
          aria-invalid={state.error ? true : undefined}
        />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>

      {state.error && (
        <p
          id="password-error"
          role="alert"
          className="text-sm"
          style={{ color: "var(--critical)" }}
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
