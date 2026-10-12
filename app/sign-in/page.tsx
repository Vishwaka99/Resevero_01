import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/screens/SignInForm";
import { Logo } from "@/components/ui";
import { getSession } from "@/lib/auth/session";
import { DEV_PASSWORD } from "@/lib/data/memory/seed";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", minHeight: "100vh", background: "var(--canvas)", color: "var(--ink)" }}>
      <aside
        style={{
          flex: "1 1 520px",
          boxSizing: "border-box",
          padding: 48,
          background: "var(--primary)",
          color: "var(--on-primary)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 48,
          minHeight: 420,
        }}
      >
        {/* The lockup sits on a white pill so the blue square never melts into the panel. */}
        <div style={{ alignSelf: "flex-start", padding: "10px 16px 10px 10px", borderRadius: 18, background: "var(--surface)", color: "var(--ink)", display: "flex" }}>
          <Logo size={40} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
          <h1 style={{ margin: 0, fontSize: 40, lineHeight: "48px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Every room, projector and van, booked once.
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: "24px", opacity: 0.9 }}>
            See what&apos;s free, reserve it in seconds, and let the system catch overlaps before they happen.
          </p>
        </div>

        {/* A quiet echo of the availability timeline. */}
        <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ height: 12, width: "30%", borderRadius: 6, background: "var(--on-primary)" }} />
            <span style={{ height: 12, width: "18%", borderRadius: 6, background: "var(--primary-soft)", opacity: 0.5 }} />
          </div>
          <div style={{ display: "flex", gap: 8, paddingLeft: "15%" }}>
            <span style={{ height: 12, width: "40%", borderRadius: 6, background: "var(--chart-3)" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ height: 12, width: "12%", borderRadius: 6, background: "var(--primary-soft)", opacity: 0.5 }} />
            <span style={{ height: 12, width: "26%", borderRadius: 6, background: "var(--on-primary)" }} />
          </div>
        </div>
      </aside>

      <main style={{ flex: "1 1 480px", display: "grid", placeItems: "center", padding: "48px 24px", boxSizing: "border-box" }}>
        <SignInForm redirectTo={next} demoPassword={DEV_PASSWORD} />
      </main>
    </div>
  );
}
