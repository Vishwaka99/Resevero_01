import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for client components.
 *
 * As with the server client, this does not reach the application's data:
 * row-level security denies everything through PostgREST, because this key is
 * visible to anyone who opens the page. It exists for Auth, Storage and
 * Realtime, should any of them be adopted.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.");
  }

  return createBrowserClient(url, key);
}
