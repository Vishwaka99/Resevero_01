"use client";

import { useActionState } from "react";

import { Alert, Button, Field, LinkButton } from "@/components/ui";
import { signUpAction } from "@/lib/bff/actions";
import { IDLE } from "@/lib/bff/action-state";

export function SignUpForm() {
  const [state, submit, pending] = useActionState(signUpAction, IDLE);

  // On success the form is replaced rather than re-rendered empty: there is
  // nothing more to type, and the next step happens in the inbox.
  if (state.status === "success") {
    return (
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>Almost there</h2>
        <Alert tone="success" title="Account requested">
          {state.message}
        </Alert>
        <LinkButton href="/sign-in" variant="secondary" size="lg" block>
          Back to sign in
        </LinkButton>
      </div>
    );
  }

  return (
    <form action={submit} style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>Create an account</h2>
        <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: 14 }}>
          Use your work email. An admin approves new accounts before they can book anything.
        </p>
      </div>

      {state.status === "error" && state.message ? <Alert tone="danger" title={state.message} /> : null}

      <Field label="Full name" name="name" type="text" placeholder="Nimal Perera" autoComplete="name" required error={state.errors?.name} />
      <Field
        label="Work email"
        name="email"
        type="email"
        placeholder="name@company.lk"
        autoComplete="email"
        required
        error={state.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        placeholder="••••••••"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        error={state.errors?.password}
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        placeholder="••••••••"
        autoComplete="new-password"
        required
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
