import { Logo } from "@/components/ui";

/**
 * The panel beside the auth forms.
 *
 * It carries the pitch, not the branding: the lockup sits above the form on
 * the other side, which is where someone's eye starts. Content is centred and
 * stacked — a decorative band, the line, the supporting sentence — so the two
 * halves of the card balance rather than one being top-heavy.
 */
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

/**
 * The shell both auth pages sit in: one centred card, form on the left and
 * the panel on the right.
 *
 * `data-theme="light"` pins these pages to the light palette whatever the
 * rest of the app is doing. The tokens are selected by that attribute rather
 * than by `:root` alone, so redeclaring it here re-resolves every custom
 * property for this subtree — a dark `<html>` stops at the door. `colorScheme`
 * has to come with it, or the browser keeps drawing the parts it owns — the
 * autofill background, the date and time pickers — dark against a light page.
 */
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
