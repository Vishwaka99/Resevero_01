"use client";

import { useActionState } from "react";

import { Alert, Button, Field, PasswordField } from "@/components/ui";
import { signUpAction } from "@/lib/bff/actions";
import { IDLE } from "@/lib/bff/action-state";

/**
 * There is no success branch: registering signs the person in and the action
 * redirects, so the only thing this has to render well is a refusal — which
 * means keeping what was typed. Both passwords are deliberately not carried
 * back; they are short to retype and should not survive a round trip.
 *
 * The browser-level constraints below are a convenience, not the check. Every
 * one of them is also in `signUpInput`, which is what actually decides —
 * anything arriving at a server action has not necessarily been through this
 * form.
 */
export function SignUpForm() {
  const [state, submit, pending] = useActionState(signUpAction, IDLE);

  return (
    <form action={submit} style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>Create an account</h2>
        <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: 14 }}>
          Use your work email. You can start booking as soon as you have signed up.
        </p>
      </div>

      {state.status === "error" && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <Field
        label="Full name"
        name="name"
        type="text"
        placeholder="Nimal Perera"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        minLength={2}
        maxLength={80}
        error={state.errors?.name}
      />
      <Field
        label="Work email"
        name="email"
        type="email"
        placeholder="name@company.lk"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        maxLength={160}
        error={state.errors?.email}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        hint="At least 8 characters."
        error={state.errors?.password}
      />
      <PasswordField
        label="Confirm password"
        name="confirmPassword"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={72}
        error={state.errors?.confirmPassword}
      />

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p style={{ margin: 0, fontSize: 14, color: "var(--ink-muted)", textAlign: "center" }}>
        Already have an account? <a href="/sign-in" style={{ color: "var(--primary)", fontWeight: 600 }}>Sign in</a>
      </p>
    </form>
  );
}
