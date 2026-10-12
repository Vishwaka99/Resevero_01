import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key, for the few operations that act
 * on someone *else's* identity: creating the sign-in for an invited user, and
 * seeding the demo accounts.
 *
 * The key bypasses row-level security and can mint a session for any user, so
 * it must never reach the browser. Two things keep it server-side: the name has
 * no `NEXT_PUBLIC_` prefix, so Next will not inline it into a client bundle,
 * and nothing in this module is imported by a client component. Check both
 * before importing it somewhere new.
 *
 * Session persistence is off because there is no user here to stay signed in —
 * each call is a one-shot administrative action.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to create or seed accounts. " +
        "The service-role key is in Project Settings > API; keep it out of .env.example and the browser.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
