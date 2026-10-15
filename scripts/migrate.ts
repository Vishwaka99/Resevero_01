/** Applies the SQL files in supabase/migrations, in filename order, once each. */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { connect, databaseUrl } from "../lib/data/postgres/client";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

async function main() {
  const sql = connect(databaseUrl(), { max: 1 });

  try {
    await sql`
      create table if not exists schema_migrations (
        name       text primary key,
        applied_at timestamptz not null default now()
      )
    `;

    const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((row) => row.name));
    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

    if (!files.length) {
      console.log("No migrations found in supabase/migrations.");
      return;
    }

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`· ${file} (already applied)`);
        continue;
      }

      const statements = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`→ ${file} ... `);

      // The files wrap themselves in begin/commit; strip those so the driver's
      // own transaction is the only one, and a failure rolls the whole file back.
      const body = statements.replace(/^\s*begin\s*;/im, "").replace(/commit\s*;\s*$/im, "");

      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });

      console.log("done");
      ran += 1;
    }

    console.log(ran ? `\nApplied ${ran} migration${ran === 1 ? "" : "s"}.` : "\nNothing to apply; the schema is up to date.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("\nMigration failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
