/**
 * Creates the demo accounts' Supabase identities, and nothing else.
 *
 *   npm run auth:seed
 *
 * `db:seed` does this too, but it also truncates and refills Postgres, so it
 * is useless on the in-memory adapter. That adapter still signs in through
 * Supabase, so without this there is nobody to sign in as — this is the piece
 * that keeps `DATA_ADAPTER=memory` usable with one command instead of seven
 * trips through the dashboard.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY. It is idempotent: running it again reuses
 * the identities it made and resets their password.
 */

import { buildSeed } from "../lib/data/memory/seed";
import { syncAuthIdentities } from "./identities";

async function main() {
  const emails = buildSeed().users.map((user) => user.email);
  await syncAuthIdentities(emails);

  console.log("\nSign in with:");
  console.log("  admin@reservo.test   (admin)");
  console.log("  member@reservo.test  (member)");
  console.log("\nOn the memory adapter the profile is matched to the identity by email");
  console.log("at first sign-in. On postgres, run `npm run db:seed` instead.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
