import { Logo } from "@/components/ui";

/** The panel beside the auth forms. */
export function AuthAside({ heading, children }: { heading: string; children: string }) {
  return (
    <aside className="rv-auth-aside">
      {/* A quiet echo of the availability timeline. */}
      <div aria-hidden="true" className="rv-auth-art">
        <div className="rv-auth-art-row">
          <span style={{ width: "34%" }} />
          <span style={{ width: "20%", opacity: 0.45 }} />
        </div>
        <div className="rv-auth-art-row" style={{ paddingLeft: "16%" }}>
          <span style={{ width: "44%", background: "var(--logo-accent)" }} />
        </div>
        <div className="rv-auth-art-row">
          <span style={{ width: "14%", opacity: 0.45 }} />
          <span style={{ width: "30%" }} />
        </div>
        <div className="rv-auth-art-row" style={{ paddingLeft: "28%" }}>
          <span style={{ width: "26%", opacity: 0.45 }} />
        </div>
      </div>

      <div className="rv-auth-copy">
        <h1>{heading}</h1>
        <p>{children}</p>
      </div>

      {/* Three marks, as on the template. Decorative: there is nothing to page
          through, so they are not controls and are hidden from the reader. */}
      <div className="rv-auth-dots" aria-hidden="true">
        <i data-active="true" />
        <i />
        <i />
      </div>
    </aside>
  );
}

/** The shell both auth pages sit in: one centred card, form on the left and the panel on the right. */
export function AuthLayout({ aside, children }: { aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-theme="light" style={{ colorScheme: "light" }} className="rv-auth-page">
      <div className="rv-auth-card">
        <main className="rv-auth-form">
          <div className="rv-auth-brand">
            <Logo size={34} />
          </div>
          {children}
        </main>
        {aside}
      </div>
    </div>
  );
}
