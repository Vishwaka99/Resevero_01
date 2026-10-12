/**
 * PostgreSQL data adapter (Supabase).
 *
 * It implements the same `DataStore` as the in-memory adapter, so nothing in
 * `lib/server`, `lib/bff`, `app/` or `components/` knows which one is running.
 *
 * Two things are the database's job here, not the application's:
 *
 *   - `createGuarded` / `rescheduleGuarded` let the write attempt happen and
 *     catch the exclusion-constraint violation (23P01). That is what makes
 *     double-booking impossible even when two requests pass the pre-flight
 *     check in the same millisecond.
 *   - `runInTransaction` opens a real transaction, so a write and its audit
 *     row commit together or not at all.
 *
 * Columns are snake_case in the database and camelCase in the domain. Rather
 * than a magic transform, every query aliases its columns explicitly, so what
 * a row looks like is readable at the query.
 */

import { BLOCKING_STATUSES } from "@/lib/domain/types";
import type {
  AuditLog,
  Blackout,
  Department,
  Location,
  Notification,
  RecurrenceSeries,
  Reservation,
  ReservationWithRelations,
  Resource,
  ResourceType,
  ResourceWithRelations,
  User,
} from "@/lib/domain/types";
import type {
  AuditRepository,
  BlackoutRepository,
  CatalogRepository,
  DataStore,
  GuardedInsert,
  NewReservation,
  NotificationRepository,
  ReservationFilter,
  ReservationRepository,
  ResourceDraft,
  ResourceFilter,
  ResourceRepository,
  SeriesRepository,
  UserPatch,
  UserRepository,
} from "@/lib/data/ports";
import { db, errorCode, PG_ERROR, runInTransaction } from "./client";

/* ------------------------------------------------------------- row types */

type UserRow = Omit<User, "createdAt"> & { createdAt: Date };

type ResourceRow = Omit<Resource, "createdAt"> & {
  createdAt: Date;
  typeName: string;
  typeIcon: string;
  locationBuilding: string;
  locationFloor: string | null;
  locationName: string;
};

type ReservationRow = Reservation & {
  seriesRule: RecurrenceSeries["rule"] | null;
  seriesUntil: Date | null;
  seriesCreatedBy: string | null;
};

/* --------------------------------------------------------- column lists */

/**
 * Column lists, aliased to the camelCase names the domain uses. They contain
 * no user input — only column names — so embedding them with `sql.unsafe` is
 * safe, and keeping them in one place stops the aliases drifting between
 * queries.
 */
const COLUMNS = {
  user: `
    id,
    name,
    email,
    auth_user_id  as "authUserId",
    role,
    department_id as "departmentId",
    is_active     as "isActive",
    created_at    as "createdAt"
  `,
  resource: `
    r.id,
    r.type_id           as "typeId",
    r.location_id       as "locationId",
    r.name,
    r.description,
    r.capacity,
    r.requires_approval as "requiresApproval",
    r.requires_check_in as "requiresCheckIn",
    r.slot_minutes      as "slotMinutes",
    r.max_minutes       as "maxMinutes",
    r.open_minute       as "openMinute",
    r.close_minute      as "closeMinute",
    r.open_days         as "openDays",
    r.book_ahead_days   as "bookAheadDays",
    r.status,
    r.amenities,
    r.managed_by        as "managedBy",
    r.created_at        as "createdAt",
    t.name              as "typeName",
    t.icon              as "typeIcon",
    l.building          as "locationBuilding",
    l.floor             as "locationFloor",
    l.name              as "locationName"
  `,
  reservation: `
    res.id,
    res.code,
    res.resource_id   as "resourceId",
    res.user_id       as "userId",
    res.series_id     as "seriesId",
    res.title,
    res.attendees,
    res.starts_at     as "startsAt",
    res.ends_at       as "endsAt",
    res.status,
    res.decided_by    as "decidedBy",
    res.decided_at    as "decidedAt",
    res.decision_note as "decisionNote",
    res.checked_in_at as "checkedInAt",
    res.cancelled_at  as "cancelledAt",
    res.cancel_reason as "cancelReason",
    res.created_at    as "createdAt",
    res.updated_at    as "updatedAt"
  `,
} as const;

/* ------------------------------------------------------------- mapping */

function toResource(row: ResourceRow): ResourceWithRelations {
  const { typeName, typeIcon, locationBuilding, locationFloor, locationName, ...resource } = row;
  return {
    ...resource,
    openDays: [...row.openDays].sort((a, b) => a - b),
    type: { id: row.typeId, name: typeName, icon: typeIcon } satisfies ResourceType,
    location: { id: row.locationId, building: locationBuilding, floor: locationFloor, name: locationName } satisfies Location,
  };
}

function toReservation(row: ReservationRow, resource: ResourceWithRelations, user: User): ReservationWithRelations {
  const { seriesRule, seriesUntil, seriesCreatedBy, ...reservation } = row;
  return {
    ...reservation,
    resource,
    user,
    series:
      row.seriesId && seriesRule && seriesUntil && seriesCreatedBy
        ? { id: row.seriesId, rule: seriesRule, until: seriesUntil, createdBy: seriesCreatedBy }
        : null,
  };
}

/**
 * Loads the resources and users a set of reservations point at, in two queries
 * rather than one per row.
 */
async function hydrate(rows: ReservationRow[]): Promise<ReservationWithRelations[]> {
  if (!rows.length) return [];

  const sql = db();
  const resourceIds = [...new Set(rows.map((row) => row.resourceId))];
  const userIds = [...new Set(rows.map((row) => row.userId))];

  const [resourceRows, userRows] = await Promise.all([
    sql<ResourceRow[]>`
      select ${sql.unsafe(COLUMNS.resource)}
      from resources r
      join resource_types t on t.id = r.type_id
      join locations l on l.id = r.location_id
      where r.id = any(${resourceIds}::uuid[])
    `,
    sql<UserRow[]>`
      select ${sql.unsafe(COLUMNS.user)} from users where id = any(${userIds}::uuid[])
    `,
  ]);

  const resourcesById = new Map(resourceRows.map((row) => [row.id, toResource(row)]));
  const usersById = new Map(userRows.map((row) => [row.id, row as User]));

  return rows.flatMap((row) => {
    const resource = resourcesById.get(row.resourceId);
    const user = usersById.get(row.userId);
    if (!resource || !user) return [];
    return [toReservation(row, resource, user)];
  });
}

/* --------------------------------------------------------- repositories */

const users: UserRepository = {
  async findById(id) {
    const sql = db();
    const [row] = await sql<UserRow[]>`select ${sql.unsafe(COLUMNS.user)} from users where id = ${id}`;
    return row ?? null;
  },

  async findByEmail(email) {
    const sql = db();
    const [row] = await sql<UserRow[]>`
      select ${sql.unsafe(COLUMNS.user)} from users where lower(email) = lower(${email.trim()})
    `;
    return row ?? null;
  },

  async findByAuthUserId(authUserId) {
    const sql = db();
    const [row] = await sql<UserRow[]>`
      select ${sql.unsafe(COLUMNS.user)} from users where auth_user_id = ${authUserId}
    `;
    return row ?? null;
  },

  async list() {
    const sql = db();
    return sql<UserRow[]>`select ${sql.unsafe(COLUMNS.user)} from users order by name`;
  },

  async update(id, patch: UserPatch) {
    const sql = db();
    const changes = columnsFor(patch, {
      name: "name",
      role: "role",
      isActive: "is_active",
      departmentId: "department_id",
      authUserId: "auth_user_id",
    });

    if (!Object.keys(changes).length) {
      const existing = await users.findById(id);
      if (!existing) throw new Error(`No user ${id}`);
      return existing;
    }

    const [row] = await sql<UserRow[]>`
      update users set ${sql(changes)} where id = ${id} returning ${sql.unsafe(COLUMNS.user)}
    `;
    if (!row) throw new Error(`No user ${id}`);
    return row;
  },

  async create(input) {
    const sql = db();
    const [row] = await sql<UserRow[]>`
      insert into users (name, email, auth_user_id, role, department_id, is_active)
      values (${input.name}, ${input.email}, ${input.authUserId}, ${input.role}, ${input.departmentId}, ${input.isActive})
      returning ${sql.unsafe(COLUMNS.user)}
    `;
    return row;
  },
};

const catalog: CatalogRepository = {
  async departments() {
    return db()<Department[]>`select id, name from departments order by name`;
  },
  async resourceTypes() {
    return db()<ResourceType[]>`select id, name, icon from resource_types order by name`;
  },
  async locations() {
    return db()<Location[]>`select id, building, floor, name from locations order by name`;
  },
};

const resources: ResourceRepository = {
  async findById(id) {
    const sql = db();
    const [row] = await sql<ResourceRow[]>`
      select ${sql.unsafe(COLUMNS.resource)}
      from resources r
      join resource_types t on t.id = r.type_id
      join locations l on l.id = r.location_id
      where r.id = ${id}
    `;
    return row ? toResource(row) : null;
  },

  async list(filter: ResourceFilter = {}) {
    const sql = db();
    const needle = filter.query?.trim();

    const rows = await sql<ResourceRow[]>`
      select ${sql.unsafe(COLUMNS.resource)}
      from resources r
      join resource_types t on t.id = r.type_id
      join locations l on l.id = r.location_id
      where true
        ${filter.typeId ? sql`and r.type_id = ${filter.typeId}` : sql``}
        ${filter.locationId ? sql`and r.location_id = ${filter.locationId}` : sql``}
        ${filter.minCapacity ? sql`and r.capacity >= ${filter.minCapacity}` : sql``}
        ${filter.status ? sql`and r.status = ${filter.status}` : sql``}
        ${filter.amenities?.length ? sql`and r.amenities @> ${filter.amenities}` : sql``}
        ${needle ? sql`and (r.name ilike ${"%" + needle + "%"} or r.description ilike ${"%" + needle + "%"})` : sql``}
      order by r.name
    `;
    return rows.map(toResource);
  },

  async create(draft: ResourceDraft) {
    const sql = db();
    const [row] = await sql<{ id: string }[]>`
      insert into resources (
        type_id, location_id, name, description, capacity,
        requires_approval, requires_check_in, slot_minutes, max_minutes,
        open_minute, close_minute, open_days, book_ahead_days, status, amenities, managed_by
      ) values (
        ${draft.typeId}, ${draft.locationId}, ${draft.name}, ${draft.description}, ${draft.capacity},
        ${draft.requiresApproval}, ${draft.requiresCheckIn}, ${draft.slotMinutes}, ${draft.maxMinutes},
        ${draft.openMinute}, ${draft.closeMinute}, ${draft.openDays}, ${draft.bookAheadDays},
        ${draft.status}, ${draft.amenities}, ${draft.managedBy}
      )
      returning id
    `;
    const created = await resources.findById(row.id);
    if (!created) throw new Error("The resource vanished immediately after being created");
    return created;
  },

  async update(id, patch) {
    const sql = db();
    const changes = columnsFor(patch, {
      typeId: "type_id",
      locationId: "location_id",
      name: "name",
      description: "description",
      capacity: "capacity",
      requiresApproval: "requires_approval",
      requiresCheckIn: "requires_check_in",
      slotMinutes: "slot_minutes",
      maxMinutes: "max_minutes",
      openMinute: "open_minute",
      closeMinute: "close_minute",
      openDays: "open_days",
      bookAheadDays: "book_ahead_days",
      status: "status",
      amenities: "amenities",
      managedBy: "managed_by",
    });

    if (Object.keys(changes).length) {
      await sql`update resources set ${sql(changes)} where id = ${id}`;
    }

    const updated = await resources.findById(id);
    if (!updated) throw new Error(`No resource ${id}`);
    return updated;
  },
};

/**
 * Turns a partial domain patch into the snake_cased row the driver expects for
 * a dynamic UPDATE, keeping only the fields actually supplied. Leaving a field
 * out of the patch leaves the column alone; setting it to null clears it.
 */
function columnsFor<T extends object>(patch: T, mapping: Partial<Record<keyof T, string>>): Record<string, never> {
  const row: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(mapping) as Array<[keyof T, string]>) {
    const value = patch[key];
    if (value !== undefined) row[column] = value;
  }
  return row as Record<string, never>;
}

const reservations: ReservationRepository = {
  async findById(id) {
    const sql = db();
    const rows = await sql<ReservationRow[]>`
      select ${sql.unsafe(COLUMNS.reservation)},
             s.rule as "seriesRule", s.until as "seriesUntil", s.created_by as "seriesCreatedBy"
      from reservations res
      left join recurrence_series s on s.id = res.series_id
      where res.id = ${id}
    `;
    return (await hydrate(rows))[0] ?? null;
  },

  async findByCode(code) {
    const sql = db();
    const rows = await sql<ReservationRow[]>`
      select ${sql.unsafe(COLUMNS.reservation)},
             s.rule as "seriesRule", s.until as "seriesUntil", s.created_by as "seriesCreatedBy"
      from reservations res
      left join recurrence_series s on s.id = res.series_id
      where upper(res.code) = upper(${code.trim()})
    `;
    return (await hydrate(rows))[0] ?? null;
  },

  async list(filter: ReservationFilter) {
    const sql = db();
    const rows = await sql<ReservationRow[]>`
      select ${sql.unsafe(COLUMNS.reservation)},
             s.rule as "seriesRule", s.until as "seriesUntil", s.created_by as "seriesCreatedBy"
      from reservations res
      left join recurrence_series s on s.id = res.series_id
      where true
        ${filter.resourceIds ? sql`and res.resource_id = any(${filter.resourceIds}::uuid[])` : sql``}
        ${filter.userId ? sql`and res.user_id = ${filter.userId}` : sql``}
        ${filter.statuses ? sql`and res.status = any(${filter.statuses})` : sql``}
        ${filter.from ? sql`and res.ends_at > ${filter.from}` : sql``}
        ${filter.to ? sql`and res.starts_at < ${filter.to}` : sql``}
      order by res.starts_at
    `;
    return hydrate(rows);
  },

  /**
   * The slot guard. The pre-flight check in AvailabilityService has already
   * run, but it can be raced, so this simply attempts the insert: the
   * exclusion constraint decides, and a 23P01 means somebody else won.
   */
  async createGuarded(input: NewReservation): Promise<GuardedInsert> {
    const sql = db();

    const blackout = (await blackouts.findOverlapping(input.resourceId, input.startsAt, input.endsAt))[0];
    if (blackout) return { ok: false, reason: "blackout", blackout };

    try {
      const [row] = await sql<{ id: string }[]>`
        insert into reservations (resource_id, user_id, series_id, title, attendees, starts_at, ends_at, status)
        values (
          ${input.resourceId}, ${input.userId}, ${input.seriesId}, ${input.title},
          ${input.attendees}, ${input.startsAt}, ${input.endsAt}, ${input.status}
        )
        returning id
      `;
      const created = await reservations.findById(row.id);
      if (!created) throw new Error("The reservation vanished immediately after being created");
      return { ok: true, reservation: created };
    } catch (error) {
      if (errorCode(error) !== PG_ERROR.exclusionViolation) throw error;

      const conflict = (await reservations.findOverlapping(input.resourceId, input.startsAt, input.endsAt))[0];
      if (!conflict) throw error;
      return { ok: false, reason: "overlap", conflict };
    }
  },

  async rescheduleGuarded(id, startsAt, endsAt, patch) {
    const sql = db();

    const [existing] = await sql<{ resourceId: string }[]>`
      select resource_id as "resourceId" from reservations where id = ${id}
    `;
    if (!existing) throw new Error(`No reservation ${id}`);

    const blackout = (await blackouts.findOverlapping(existing.resourceId, startsAt, endsAt))[0];
    if (blackout) return { ok: false, reason: "blackout", blackout };

    try {
      await sql`
        update reservations set
          starts_at = ${startsAt},
          ends_at   = ${endsAt},
          title     = coalesce(${patch?.title ?? null}, title),
          attendees = coalesce(${patch?.attendees ?? null}, attendees)
        where id = ${id}
      `;
      const moved = await reservations.findById(id);
      if (!moved) throw new Error(`No reservation ${id}`);
      return { ok: true, reservation: moved };
    } catch (error) {
      if (errorCode(error) !== PG_ERROR.exclusionViolation) throw error;

      const conflict = (await reservations.findOverlapping(existing.resourceId, startsAt, endsAt, id))[0];
      if (!conflict) throw error;
      return { ok: false, reason: "overlap", conflict };
    }
  },

  async update(id, patch) {
    const sql = db();
    const changes = columnsFor(patch, {
      status: "status",
      title: "title",
      attendees: "attendees",
      startsAt: "starts_at",
      endsAt: "ends_at",
      decidedBy: "decided_by",
      decidedAt: "decided_at",
      decisionNote: "decision_note",
      checkedInAt: "checked_in_at",
      cancelledAt: "cancelled_at",
      cancelReason: "cancel_reason",
      userId: "user_id",
      seriesId: "series_id",
    });

    if (!Object.keys(changes).length) {
      const [unchanged] = await sql<Reservation[]>`
        select ${sql.unsafe(COLUMNS.reservation)} from reservations res where res.id = ${id}
      `;
      if (!unchanged) throw new Error(`No reservation ${id}`);
      return unchanged;
    }

    const [row] = await sql<Reservation[]>`
      update reservations res set ${sql(changes)}
      where res.id = ${id}
      returning ${sql.unsafe(COLUMNS.reservation)}
    `;
    if (!row) throw new Error(`No reservation ${id}`);
    return row;
  },

  async findOverlapping(resourceId, startsAt, endsAt, ignoreId) {
    const sql = db();
    const rows = await sql<ReservationRow[]>`
      select ${sql.unsafe(COLUMNS.reservation)},
             s.rule as "seriesRule", s.until as "seriesUntil", s.created_by as "seriesCreatedBy"
      from reservations res
      left join recurrence_series s on s.id = res.series_id
      where res.resource_id = ${resourceId}
        and res.status = any(${BLOCKING_STATUSES})
        and tstzrange(res.starts_at, res.ends_at, '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
        ${ignoreId ? sql`and res.id <> ${ignoreId}` : sql``}
      order by res.starts_at
    `;
    return hydrate(rows);
  },

  /**
   * Codes come from a database sequence, claimed at insert by the column
   * default. This exists for the port, and hands out the next one the same way
   * so the two can never collide.
   */
  async nextCode() {
    const sql = db();
    const [row] = await sql<{ code: string }[]>`select 'RSV-' || nextval('reservation_code_seq') as code`;
    return row.code;
  },
};

const series: SeriesRepository = {
  async create(input) {
    const sql = db();
    const [row] = await sql<RecurrenceSeries[]>`
      insert into recurrence_series (rule, until, created_by)
      values (${input.rule}, ${input.until}, ${input.createdBy})
      returning id, rule, until, created_by as "createdBy"
    `;
    return row;
  },
  async findById(id) {
    const sql = db();
    const [row] = await sql<RecurrenceSeries[]>`
      select id, rule, until, created_by as "createdBy" from recurrence_series where id = ${id}
    `;
    return row ?? null;
  },
};

const BLACKOUT_COLUMNS = `
  id,
  resource_id as "resourceId",
  starts_at   as "startsAt",
  ends_at     as "endsAt",
  reason,
  created_by  as "createdBy"
`;

const blackouts: BlackoutRepository = {
  async list(resourceIds, from, to) {
    if (!resourceIds.length) return [];
    const sql = db();
    return sql<Blackout[]>`
      select ${sql.unsafe(BLACKOUT_COLUMNS)}
      from blackouts
      where resource_id = any(${resourceIds}::uuid[])
        and tstzrange(starts_at, ends_at, '[)') && tstzrange(${from}, ${to}, '[)')
      order by starts_at
    `;
  },

  async findOverlapping(resourceId, startsAt, endsAt) {
    const sql = db();
    return sql<Blackout[]>`
      select ${sql.unsafe(BLACKOUT_COLUMNS)}
      from blackouts
      where resource_id = ${resourceId}
        and tstzrange(starts_at, ends_at, '[)') && tstzrange(${startsAt}, ${endsAt}, '[)')
      order by starts_at
    `;
  },

  async create(input) {
    const sql = db();
    const [row] = await sql<Blackout[]>`
      insert into blackouts (resource_id, starts_at, ends_at, reason, created_by)
      values (${input.resourceId}, ${input.startsAt}, ${input.endsAt}, ${input.reason}, ${input.createdBy})
      returning ${sql.unsafe(BLACKOUT_COLUMNS)}
    `;
    return row;
  },
};

const NOTIFICATION_COLUMNS = `
  id,
  user_id        as "userId",
  reservation_id as "reservationId",
  kind,
  title,
  body,
  read_at        as "readAt",
  created_at     as "createdAt"
`;

const notifications: NotificationRepository = {
  async create(input) {
    const sql = db();
    const [row] = await sql<Notification[]>`
      insert into notifications (user_id, reservation_id, kind, title, body)
      values (${input.userId}, ${input.reservationId}, ${input.kind}, ${input.title}, ${input.body})
      returning ${sql.unsafe(NOTIFICATION_COLUMNS)}
    `;
    return row;
  },

  async listForUser(userId, limit = 20) {
    const sql = db();
    return sql<Notification[]>`
      select ${sql.unsafe(NOTIFICATION_COLUMNS)}
      from notifications
      where user_id = ${userId}
      order by created_at desc
      limit ${limit}
    `;
  },

  async countUnread(userId) {
    const sql = db();
    const [row] = await sql<{ count: string }[]>`
      select count(*)::text as count from notifications where user_id = ${userId} and read_at is null
    `;
    return Number(row.count);
  },

  async markAllRead(userId) {
    const sql = db();
    await sql`update notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  },
};

const AUDIT_COLUMNS = `
  id,
  actor_id  as "actorId",
  entity,
  entity_id as "entityId",
  action,
  diff,
  created_at as "createdAt"
`;

const audit: AuditRepository = {
  async create(input) {
    const sql = db();
    const [row] = await sql<AuditLog[]>`
      insert into audit_logs (actor_id, entity, entity_id, action, diff)
      values (${input.actorId}, ${input.entity}, ${input.entityId}, ${input.action}, ${sql.json(input.diff as never)})
      returning ${sql.unsafe(AUDIT_COLUMNS)}
    `;
    return row;
  },

  async list(limit = 50) {
    const sql = db();
    return sql<AuditLog[]>`
      select ${sql.unsafe(AUDIT_COLUMNS)} from audit_logs order by created_at desc limit ${limit}
    `;
  },
};

export const postgresStore: DataStore = {
  users,
  catalog,
  resources,
  reservations,
  series,
  blackouts,
  notifications,
  audit,
  runInTransaction,
};
