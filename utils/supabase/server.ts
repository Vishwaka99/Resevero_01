import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";

/**
 * Supabase client for server components and route handlers.
 *
 * Note on how this project uses Supabase: the PostgREST API reached through
 * this client is **not** the data path. Every table has row-level security
 * enabled with no policies, so this client can read nothing — deliberately,
 * because the publishable key below ships to the browser.
 *
 * The application's data goes over a direct Postgres connection instead, which
 * is the only way to get the transactions and the exclusion-constraint error
 * that `lib/data/ports.ts` is built around. See `lib/data/postgres/`.
 *
 * This client is here for the Supabase features that are reached over HTTP —
 * Auth, Storage, Realtime — if any of them are adopted later.
 */
export function createClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // Safe to ignore: the proxy refreshes the session on the next request.
        }
      },
    },
  });
}
