import Link from "next/link";

import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--canvas)",
        color: "var(--ink)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", maxWidth: 420 }}>
        <Logo size={40} />
        <h1 style={{ margin: 0, font: "700 24px/32px var(--font-sans)" }}>That page doesn&apos;t exist</h1>
        <p style={{ margin: 0, color: "var(--ink-muted)" }}>
          The link may be out of date, or the resource may have been retired.
        </p>
        <Link href="/dashboard" className="rv-btn rv-btn-primary" style={{ textDecoration: "none" }}>
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
