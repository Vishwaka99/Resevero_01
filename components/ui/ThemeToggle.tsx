"use client";

import { useSyncExternalStore } from "react";

import { Icon } from "./Icon";

/**
 * Light/dark switch.
 *
 * The stylesheet already follows the system preference, so this exists only to
 * override it. That shapes the storage: nothing is written until someone
 * actually chooses, so a visitor who never touches this keeps following their
 * system even if it changes mid-session.
 *
 * The theme is read through `useSyncExternalStore` rather than held in state.
 * It lives in the browser — in storage and in a media query — and this is the
 * API for rendering from something React does not own: no effect that sets
 * state on mount, no hydration mismatch, and a system change while the page is
 * open is picked up as it happens.
 */
const STORAGE_KEY = "rv-theme";
const QUERY = "(prefers-color-scheme: dark)";

type Theme = "light" | "dark";

/** Local writes do not raise a storage event, so subscribers are told here. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  // Fires when another tab chooses, which should move this one too.
  window.addEventListener("storage", onChange);

  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readTheme(): Theme {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage. Fall through to the system preference.
  }
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia(QUERY).matches ? "dark" : "light";
}

/**
 * Null on the server: which theme a browser will land on is not knowable here,
 * and guessing would render the wrong icon half the time.
 */
function readOnServer(): Theme | null {
  return null;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, readOnServer);

  function choose(next: Theme) {
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing, or storage blocked or full. The page is already in
      // the right theme; it just will not be next time.
    }
    for (const listener of listeners) listener();
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button
      type="button"
      className="rv-btn rv-btn-secondary rv-btn-icon"
      aria-label={label}
      title={label}
      // Nothing to press until we know which way it would go.
      disabled={theme === null}
      onClick={() => choose(theme === "dark" ? "light" : "dark")}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
