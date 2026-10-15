import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/** Supabase client with the service-role key, for the few operations that act on someone *else's* identity: creating the sign-in for an invited user, and seeding the demo accounts. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to create or seed accounts. " +
        "Use a secret key (sb_secret_...) from Project Settings > API Keys, or the legacy service_role JWT " +
        "on an older project. Keep it out of version control and out of the browser.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** The id of the Supabase identity using this address, or null. */
export async function findIdentityByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const needle = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === needle)?.id ?? null;
}
