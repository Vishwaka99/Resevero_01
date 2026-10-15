"use client";

import { useActionState } from "react";

import { Alert, Button, Checkbox, Field } from "@/components/ui";
import { signInAction } from "@/lib/bff/actions";
import { IDLE } from "@/lib/bff/action-state";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const [state, submit, pending] = useActionState(signInAction, IDLE);

  return (
    <form action={submit} style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700 }}>Sign in</h2>
        <p style={{ margin: "4px 0 0", color: "var(--ink-muted)", fontSize: 14 }}>
          Use your work email, or create an account if you do not have one yet.
        </p>
      </div>

      {state.status === "error" && state.message ? <Alert tone="danger" title={state.message} /> : null}

      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

      <Field
        label="Work email"
        name="email"
        type="email"
        placeholder="name@company.lk"
        autoComplete="email"
        required
        maxLength={160}
        error={state.errors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
        error={state.errors?.password}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Checkbox label="Keep me signed in" name="keepSignedIn" defaultChecked />
      </div>

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p style={{ margin: 0, fontSize: 14, color: "var(--ink-muted)", textAlign: "center" }}>
        No account? <a href="/sign-up" style={{ color: "var(--primary)", fontWeight: 600 }}>Create one</a>
      </p>

    </form>
  );
}
