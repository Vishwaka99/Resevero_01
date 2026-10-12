"use client";

import { useEffect } from "react";

/**
 * The last resort when a page throws. Domain failures are turned into messages
 * long before they reach here, so anything that lands on this page is a bug.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[reservo] page error", error);
  }, [error]);

  return (
    <div className="rv-page">
      <section className="rv-card">
        <div className="rv-empty">
          <div className="rv-empty-icon" aria-hidden="true">
            !
          </div>
          <h3>Something went wrong</h3>
          <p>
            The page couldn&apos;t be loaded. Nothing you booked has been lost — try again, and if it keeps happening tell an admin.
            {error.digest ? ` Reference ${error.digest}.` : ""}
          </p>
          <div className="rv-inline">
            <button type="button" className="rv-btn rv-btn-primary" onClick={reset}>
              Try again
            </button>
            <a href="/dashboard" className="rv-btn rv-btn-secondary" style={{ textDecoration: "none" }}>
              Back to the dashboard
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
