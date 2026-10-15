/**
 * In-memory data adapter.
 *
 * It implements `DataStore` exactly as the PostgreSQL adapter in
 * `lib/data/postgres` does, including the two things the database is
 * responsible for:
 *
 *  - `createGuarded` / `rescheduleGuarded` refuse to write a slot that is
 *    already taken. Here that is a per-resource promise chain, which serialises
 *    concurrent attempts the way the exclusion constraint will.
 *  - `runInTransaction` brackets a write and its audit row.
 *
 * The data lives on `globalThis` so it survives Next.js hot reloads in dev.
 */

import { BLOCKING_STATUSES } from "@/lib/domain/types";
import { overlaps } from "@/lib/domain/time";
import type {
  AuditLog,
  Blackout,
  Department,
  Location,
  Notification,
  RecurrenceRule,
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
import { buildSeed, type Tables } from "./seed";

type MemoryState = {
  tables: Tables;
  /** One promise chain per resource id, so overlap checks cannot interleave. */
  locks: Map<string, Promise<unknown>>;
  sequence: number;
};

const GLOBAL_KEY = "__reservo_memory_store__";

function state(): MemoryState {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: MemoryState };
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = { tables: buildSeed(), locks: new Map(), sequence: 0 };
  }
  return holder[GLOBAL_KEY];
}

/** Drops the in-memory data and reseeds it. Used by tests and `/api/dev/reset`. */
export function resetMemoryStore(now: Date = new Date()) {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: MemoryState };
  holder[GLOBAL_KEY] = { tables: buildSeed(now), locks: new Map(), sequence: 0 };
}

function nextId(prefix: string): string {
  const s = state();
  s.sequence += 1;
  return `${prefix}-${Date.now().toString(36)}${s.sequence.toString(36)}`;
}

/** Serialises work per key, standing in for a row-level database guarantee. */
function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const s = state();
  const previous = s.locks.get(key) ?? Promise.resolve();
  const next = previous.then(work, work);
  s.locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

/* ------------------------------------------------------------- hydration */

function clone<T>(row: T): T {
  return structuredClone(row);
}

function hydrateResource(resource: Resource): ResourceWithRelations {
  const { resourceTypes, locations } = state().tables;
  const type = resourceTypes.find((t) => t.id === resource.typeId);
  const location = locations.find((l) => l.id === resource.locationId);
  if (!type || !location) throw new Error(`Resource ${resource.id} points at a missing type or location`);
  return { ...clone(resource), type: clone(type), location: clone(location) };
}

function hydrateReservation(reservation: Reservation): ReservationWithRelations {
  const { resources, users, series } = state().tables;
  const resource = resources.find((r) => r.id === reservation.resourceId);
  const user = users.find((u) => u.id === reservation.userId);
  if (!resource || !user) throw new Error(`Reservation ${reservation.id} points at a missing resource or user`);
  return {
    ...clone(reservation),
    resource: hydrateResource(resource),
    user: clone(user),
    series: reservation.seriesId ? (series.find((s) => s.id === reservation.seriesId) ?? null) : null,
  };
}

/* ---------------------------------------------------------- repositories */

const users: UserRepository = {
  async findById(id) {
    const found = state().tables.users.find((u) => u.id === id);
    return found ? clone(found) : null;
  },
  async findByEmail(email) {
    const needle = email.trim().toLowerCase();
    const found = state().tables.users.find((u) => u.email.toLowerCase() === needle);
    return found ? clone(found) : null;
  },
  async findByAuthUserId(authUserId) {
    const found = state().tables.users.find((u) => u.authUserId === authUserId);
    return found ? clone(found) : null;
  },
  async list() {
    return state().tables.users.map(clone).sort((a, b) => a.name.localeCompare(b.name));
  },
  async update(id, patch: UserPatch) {
    const row = state().tables.users.find((u) => u.id === id);
    if (!row) throw new Error(`No user ${id}`);
    Object.assign(row, patch);
    return clone(row);
  },
  async create(input) {
    const row: User = { ...input, id: nextId("usr"), createdAt: new Date() };
    state().tables.users.push(row);
    return clone(row);
  },
};

const catalog: CatalogRepository = {
  async departments(): Promise<Department[]> {
    return state().tables.departments.map(clone);
  },
  async resourceTypes(): Promise<ResourceType[]> {
    return state().tables.resourceTypes.map(clone);
  },
  async locations(): Promise<Location[]> {
    return state().tables.locations.map(clone);
  },
};

const resources: ResourceRepository = {
  async findById(id) {
    const found = state().tables.resources.find((r) => r.id === id);
    return found ? hydrateResource(found) : null;
  },

  async list(filter: ResourceFilter = {}) {
    const needle = filter.query?.trim().toLowerCase();
    return state()
      .tables.resources.filter((resource) => {
        if (filter.typeId && resource.typeId !== filter.typeId) return false;
        if (filter.locationId && resource.locationId !== filter.locationId) return false;
        if (filter.minCapacity && resource.capacity < filter.minCapacity) return false;
        if (filter.status && resource.status !== filter.status) return false;
        if (filter.amenities?.length && !filter.amenities.every((a) => resource.amenities.includes(a))) return false;
        if (needle && !`${resource.name} ${resource.description}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .map(hydrateResource)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async create(draft: ResourceDraft) {
    const row: Resource = { ...draft, id: nextId("res"), createdAt: new Date() };
    state().tables.resources.push(row);
    return hydrateResource(row);
  },

  async update(id, patch) {
    const row = state().tables.resources.find((r) => r.id === id);
    if (!row) throw new Error(`No resource ${id}`);
    Object.assign(row, patch);
    return hydrateResource(row);
  },
};

function blockingAt(resourceId: string, startsAt: Date, endsAt: Date, ignoreId?: string): Reservation[] {
  return state().tables.reservations.filter(
    (row) =>
      row.resourceId === resourceId &&
      row.id !== ignoreId &&
      BLOCKING_STATUSES.includes(row.status) &&
      overlaps({ start: row.startsAt, end: row.endsAt }, { start: startsAt, end: endsAt }),
  );
}

const reservations: ReservationRepository = {
  async findById(id) {
    const found = state().tables.reservations.find((r) => r.id === id);
    return found ? hydrateReservation(found) : null;
  },

  async findByCode(code) {
    const found = state().tables.reservations.find((r) => r.code.toLowerCase() === code.trim().toLowerCase());
    return found ? hydrateReservation(found) : null;
  },

  async list(filter: ReservationFilter) {
    return state()
      .tables.reservations.filter((row) => {
        if (filter.resourceIds && !filter.resourceIds.includes(row.resourceId)) return false;
        if (filter.userId && row.userId !== filter.userId) return false;
        if (filter.statuses && !filter.statuses.includes(row.status)) return false;
        if (filter.from && row.endsAt <= filter.from) return false;
        if (filter.to && row.startsAt >= filter.to) return false;
        return true;
      })
      .map(hydrateReservation)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  },

  async createGuarded(input: NewReservation): Promise<GuardedInsert> {
    return withLock(input.resourceId, async () => {
      const blackout = state().tables.blackouts.find(
        (b) => b.resourceId === input.resourceId && overlaps({ start: b.startsAt, end: b.endsAt }, { start: input.startsAt, end: input.endsAt }),
      );
      if (blackout) return { ok: false, reason: "blackout", blackout: clone(blackout) };

      const clash = blockingAt(input.resourceId, input.startsAt, input.endsAt)[0];
      if (clash) return { ok: false, reason: "overlap", conflict: hydrateReservation(clash) };

      const now = new Date();
      const row: Reservation = {
        id: nextId("rsv"),
        code: await reservations.nextCode(),
        resourceId: input.resourceId,
        userId: input.userId,
        seriesId: input.seriesId,
        title: input.title,
        attendees: input.attendees,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status,
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        checkedInAt: null,
        cancelledAt: null,
        cancelReason: null,
        createdAt: now,
        updatedAt: now,
      };
      state().tables.reservations.push(row);
      return { ok: true, reservation: clone(row) };
    });
  },

  async confirmGuarded(id, patch): Promise<GuardedInsert> {
    const existing = state().tables.reservations.find((r) => r.id === id);
    if (!existing) throw new Error(`No reservation ${id}`);

    return withLock(existing.resourceId, async () => {
      const row = state().tables.reservations.find((r) => r.id === id);
      if (!row) throw new Error(`No reservation ${id}`);

      const blackout = state().tables.blackouts.find(
        (b) => b.resourceId === row.resourceId && overlaps({ start: b.startsAt, end: b.endsAt }, { start: row.startsAt, end: row.endsAt }),
      );
      if (blackout) return { ok: false as const, reason: "blackout" as const, blackout: clone(blackout) };

      // Re-read inside the lock: another approval may have claimed the slot
      // between this request reaching the queue and an admin deciding it.
      const clash = blockingAt(row.resourceId, row.startsAt, row.endsAt).find((r) => r.id !== id);
      if (clash) return { ok: false as const, reason: "overlap" as const, conflict: hydrateReservation(clash) };

      Object.assign(row, patch, { status: "confirmed" as const });
      return { ok: true as const, reservation: clone(row) };
    });
  },

  async rescheduleGuarded(id, startsAt, endsAt, patch) {
    const existing = state().tables.reservations.find((r) => r.id === id);
    if (!existing) throw new Error(`No reservation ${id}`);

    return withLock(existing.resourceId, async () => {
      const blackout = state().tables.blackouts.find(
        (b) => b.resourceId === existing.resourceId && overlaps({ start: b.startsAt, end: b.endsAt }, { start: startsAt, end: endsAt }),
      );
      if (blackout) return { ok: false, reason: "blackout", blackout: clone(blackout) };

      const clash = blockingAt(existing.resourceId, startsAt, endsAt, id)[0];
      if (clash) return { ok: false, reason: "overlap", conflict: hydrateReservation(clash) };

      existing.startsAt = startsAt;
      existing.endsAt = endsAt;
      if (patch?.title !== undefined) existing.title = patch.title;
      if (patch?.attendees !== undefined) existing.attendees = patch.attendees;
      existing.updatedAt = new Date();
      return { ok: true, reservation: clone(existing) };
    });
  },

  async update(id, patch) {
    const row = state().tables.reservations.find((r) => r.id === id);
    if (!row) throw new Error(`No reservation ${id}`);
    Object.assign(row, patch, { updatedAt: new Date() });
    return clone(row);
  },

  async findOverlapping(resourceId, startsAt, endsAt, ignoreId) {
    return blockingAt(resourceId, startsAt, endsAt, ignoreId).map(hydrateReservation);
  },

  async nextCode() {
    const tables = state().tables;
    tables.codeCounter += 1;
    return `RSV-${tables.codeCounter}`;
  },
};

const series: SeriesRepository = {
  async create(input: { rule: RecurrenceRule; until: Date; createdBy: string }) {
    const row: RecurrenceSeries = { ...input, id: nextId("ser") };
    state().tables.series.push(row);
    return clone(row);
  },
  async findById(id) {
    const found = state().tables.series.find((s) => s.id === id);
    return found ? clone(found) : null;
  },
};

const blackouts: BlackoutRepository = {
  async list(resourceIds, from, to) {
    return state()
      .tables.blackouts.filter(
        (b) => resourceIds.includes(b.resourceId) && overlaps({ start: b.startsAt, end: b.endsAt }, { start: from, end: to }),
      )
      .map(clone);
  },
  async findOverlapping(resourceId, startsAt, endsAt) {
    return state()
      .tables.blackouts.filter(
        (b) => b.resourceId === resourceId && overlaps({ start: b.startsAt, end: b.endsAt }, { start: startsAt, end: endsAt }),
      )
      .map(clone);
  },
  async create(input) {
    const row: Blackout = { ...input, id: nextId("blk") };
    state().tables.blackouts.push(row);
    return clone(row);
  },
};

const notifications: NotificationRepository = {
  async create(input) {
    const row: Notification = { ...input, id: nextId("ntf"), readAt: null, createdAt: new Date() };
    state().tables.notifications.push(row);
    return clone(row);
  },
  async listForUser(userId, limit = 20) {
    return state()
      .tables.notifications.filter((n) => n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(clone);
  },
  async countUnread(userId) {
    return state().tables.notifications.filter((n) => n.userId === userId && !n.readAt).length;
  },
  async markAllRead(userId) {
    const now = new Date();
    for (const row of state().tables.notifications) {
      if (row.userId === userId && !row.readAt) row.readAt = now;
    }
  },
};

const audit: AuditRepository = {
  async create(input) {
    const row: AuditLog = { ...input, id: nextId("aud"), createdAt: new Date() };
    state().tables.audit.push(row);
    return clone(row);
  },
  async list(limit = 50) {
    return state()
      .tables.audit.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(clone);
  },
};

export const memoryStore: DataStore = {
  users,
  catalog,
  resources,
  reservations,
  series,
  blackouts,
  notifications,
  audit,
  async runInTransaction(work) {
    // Nothing to roll back in memory; the Postgres adapter opens a real
    // transaction here so a write and its audit row land together.
    return work();
  },
};
