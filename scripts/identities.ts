/**
 * Reconciling the demo accounts' Supabase identities.
 *
 * Shared by `db:seed`, which needs the ids to write `users.auth_user_id`, and
 * by `auth:seed`, which creates the identities on their own for the in-memory
 * adapter — that one has no database to seed, but sign-in still goes through
 * Supabase and still needs somebody to sign in as.
 */

import { DEV_PASSWORD } from "../lib/data/memory/seed";
import { createAdminClient } from "../utils/supabase/admin";

/**
 * Gives every seeded profile a Supabase identity and returns the ids, keyed by
 * email.
 *
 * Truncating `users` does not touch `auth.users`, so re-seeding meets the
 * identities it made last time. Those are reused and their password is reset
 * to DEV_PASSWORD, which keeps re-seeding repeatable without orphaning the
 * accounts people are already signed in to.
 *
 * Identities are confirmed on creation: nobody is going to click a link for a
 * demo account, and an unconfirmed one cannot sign in with a password.
 */
export async function syncAuthIdentities(emails: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const byEmail = new Map<string, string>();

  // One page is plenty for a demo seed, and asking for more than Supabase
  // allows is an error rather than a truncation.
  const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.error) throw existing.error;
  for (const user of existing.data.users) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
  }

  let created = 0;
  let reused = 0;

  for (const email of emails) {
    const key = email.toLowerCase();
    const found = byEmail.get(key);

    if (found) {
      const reset = await admin.auth.admin.updateUserById(found, { password: DEV_PASSWORD, email_confirm: true });
      if (reset.error) throw reset.error;
      reused += 1;
      continue;
    }

    const made = await admin.auth.admin.createUser({ email: key, password: DEV_PASSWORD, email_confirm: true });
    if (made.error || !made.data.user) throw made.error ?? new Error(`Could not create an identity for ${email}`);
    byEmail.set(key, made.data.user.id);
    created += 1;
  }

  console.log(`Identities: ${created} created, ${reused} reused, password "${DEV_PASSWORD}".`);
  return byEmail;
}
