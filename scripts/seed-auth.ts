/** Creates the demo accounts' Supabase identities, and nothing else. */

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
