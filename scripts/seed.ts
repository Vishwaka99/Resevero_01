/**
 * Loads the development seed into Supabase.
 *
 *   npm run db:seed
 *
 * It reuses `buildSeed()` — the same data the in-memory adapter starts from —
 * so the two adapters show the same application, and there is one place to
 * change the demo data. The seed is built relative to today, so the dashboard
 * and approvals queue look alive whenever it is run.
 *
 * It clears the tables first, so running it again gives a clean, repeatable
 * state. It refuses to run against a database that is not obviously a
 * development one unless --force is passed.
 */

import { createHash } from "node:crypto";

import { buildSeed, DEV_PASSWORD } from "../lib/data/memory/seed";
import { connect, databaseUrl } from "../lib/data/postgres/client";

const force = process.argv.includes("--force");

/**
 * The seed identifies rows by readable slugs ("res-board-a"), which is a help
 * when debugging the in-memory adapter. Postgres keys are uuids, so each slug
 * is hashed into one, the same way every time. Deterministic means re-seeding
 * produces identical ids and the relations between rows survive the move.
 */
const uuidCache = new Map<string, string>();

function uuid(slug: string | null): string | null {
  if (slug === null) return null;

  const cached = uuidCache.get(slug);
  if (cached) return cached;

  const hash = createHash("sha1").update(`reservo:${slug}`).digest();
  // Set the version (5) and variant bits, so the result is a well-formed uuid.
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");
  const value = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  uuidCache.set(slug, value);
  return value;
}

async function main() {
  const url = databaseUrl();
  if (/prod/i.test(url) && !force) {
    throw new Error("DATABASE_URL looks like production. Re-run with --force if that is really what you want.");
  }

  const seed = buildSeed();
  const sql = connect(url, { max: 1 });

  try {
    await sql.begin(async (tx) => {
      // Children first; the foreign keys would block any other order.
      await tx`truncate
        audit_logs, notifications, blackouts, reservations, recurrence_series,
        resources, locations, resource_types, users, departments
        restart identity cascade`;
      await tx`alter sequence reservation_code_seq restart with 2100`;

      for (const row of seed.departments) {
        await tx`insert into departments (id, name) values (${uuid(row.id)}::uuid, ${row.name})`;
      }

      for (const row of seed.users) {
        await tx`
          insert into users (id, name, email, password_hash, role, department_id, is_active, created_at)
          values (${uuid(row.id)}::uuid, ${row.name}, ${row.email}, ${row.passwordHash}, ${row.role},
                  ${uuid(row.departmentId)}::uuid, ${row.isActive}, ${row.createdAt})
        `;
      }

      for (const row of seed.resourceTypes) {
        await tx`insert into resource_types (id, name, icon) values (${uuid(row.id)}::uuid, ${row.name}, ${row.icon})`;
      }

      for (const row of seed.locations) {
        await tx`
          insert into locations (id, building, floor, name)
          values (${uuid(row.id)}::uuid, ${row.building}, ${row.floor}, ${row.name})
        `;
      }

      for (const row of seed.resources) {
        await tx`
          insert into resources (
            id, type_id, location_id, name, description, capacity,
            requires_approval, requires_check_in, slot_minutes, max_minutes,
            open_minute, close_minute, open_days, book_ahead_days, status, amenities, managed_by, created_at
          ) values (
            ${uuid(row.id)}::uuid, ${uuid(row.typeId)}::uuid, ${uuid(row.locationId)}::uuid, ${row.name}, ${row.description}, ${row.capacity},
            ${row.requiresApproval}, ${row.requiresCheckIn}, ${row.slotMinutes}, ${row.maxMinutes},
            ${row.openMinute}, ${row.closeMinute}, ${row.openDays}, ${row.bookAheadDays},
            ${row.status}, ${row.amenities}, ${uuid(row.managedBy)}::uuid, ${row.createdAt}
          )
        `;
      }

      for (const row of seed.series) {
        await tx`
          insert into recurrence_series (id, rule, until, created_by)
          values (${uuid(row.id)}::uuid, ${row.rule}, ${row.until}, ${uuid(row.createdBy)}::uuid)
        `;
      }

      for (const row of seed.reservations) {
        await tx`
          insert into reservations (
            id, code, resource_id, user_id, series_id, title, attendees, starts_at, ends_at, status,
            decided_by, decided_at, decision_note, checked_in_at, cancelled_at, cancel_reason, created_at, updated_at
          ) values (
            ${uuid(row.id)}::uuid, ${row.code}, ${uuid(row.resourceId)}::uuid, ${uuid(row.userId)}::uuid, ${uuid(row.seriesId)}::uuid,
            ${row.title}, ${row.attendees}, ${row.startsAt}, ${row.endsAt}, ${row.status},
            ${uuid(row.decidedBy)}::uuid, ${row.decidedAt}, ${row.decisionNote}, ${row.checkedInAt},
            ${row.cancelledAt}, ${row.cancelReason}, ${row.createdAt}, ${row.updatedAt}
          )
        `;
      }

      for (const row of seed.blackouts) {
        await tx`
          insert into blackouts (id, resource_id, starts_at, ends_at, reason, created_by)
          values (${uuid(row.id)}::uuid, ${uuid(row.resourceId)}::uuid, ${row.startsAt}, ${row.endsAt}, ${row.reason}, ${uuid(row.createdBy)}::uuid)
        `;
      }

      for (const row of seed.notifications) {
        await tx`
          insert into notifications (id, user_id, reservation_id, kind, title, body, read_at, created_at)
          values (${uuid(row.id)}::uuid, ${uuid(row.userId)}::uuid, ${uuid(row.reservationId)}::uuid, ${row.kind},
                  ${row.title}, ${row.body}, ${row.readAt}, ${row.createdAt})
        `;
      }

      for (const row of seed.audit) {
        await tx`
          insert into audit_logs (id, actor_id, entity, entity_id, action, diff, created_at)
          values (${uuid(row.id)}::uuid, ${uuid(row.actorId)}::uuid, ${row.entity}, ${uuid(row.entityId)}::uuid,
                  ${row.action}, ${tx.json(row.diff as never)}, ${row.createdAt})
        `;
      }
    });

    const [counts] = await sql<{ users: string; resources: string; reservations: string }[]>`
      select
        (select count(*)::text from users) as users,
        (select count(*)::text from resources) as resources,
        (select count(*)::text from reservations) as reservations
    `;

    console.log(
      `Seeded ${counts.users} users, ${counts.resources} resources and ${counts.reservations} reservations.\n` +
        `Sign in as admin@reservo.test or member@reservo.test, password ${DEV_PASSWORD}.`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
