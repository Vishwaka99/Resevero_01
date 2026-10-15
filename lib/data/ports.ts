/** Data ports — the only shape the domain services know about. */

import type {
  AuditLog,
  Blackout,
  Department,
  Location,
  Notification,
  RecurrenceRule,
  RecurrenceSeries,
  Reservation,
  ReservationStatus,
  ReservationWithRelations,
  Resource,
  ResourceStatus,
  ResourceType,
  ResourceWithRelations,
  Role,
  User,
} from "@/lib/domain/types";

export type NewReservation = {
  resourceId: string;
  userId: string;
  seriesId: string | null;
  title: string;
  attendees: number;
  startsAt: Date;
  endsAt: Date;
  status: Extract<ReservationStatus, "pending" | "confirmed">;
};

/**
 * The result of a guarded insert. `conflict` carries the reservation already
 * holding the slot, so the caller can explain the clash instead of just failing.
 */
export type GuardedInsert =
  | { ok: true; reservation: Reservation }
  | { ok: false; reason: "overlap"; conflict: ReservationWithRelations }
  | { ok: false; reason: "blackout"; blackout: Blackout };

export type ResourceFilter = {
  typeId?: string;
  locationId?: string;
  minCapacity?: number;
  status?: ResourceStatus;
  query?: string;
  amenities?: string[];
};

export type ReservationFilter = {
  resourceIds?: string[];
  userId?: string;
  statuses?: ReservationStatus[];
  from?: Date;
  to?: Date;
};

export type UserPatch = Partial<Pick<User, "role" | "isActive" | "name" | "departmentId" | "authUserId">>;

export type ResourceDraft = Omit<Resource, "id" | "createdAt">;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** By Supabase Auth identity — the lookup every signed-in request makes. */
  findByAuthUserId(authUserId: string): Promise<User | null>;
  list(): Promise<User[]>;
  update(id: string, patch: UserPatch): Promise<User>;
  create(input: Omit<User, "id" | "createdAt">): Promise<User>;
}

export interface CatalogRepository {
  departments(): Promise<Department[]>;
  resourceTypes(): Promise<ResourceType[]>;
  locations(): Promise<Location[]>;
}

export interface ResourceRepository {
  findById(id: string): Promise<ResourceWithRelations | null>;
  list(filter?: ResourceFilter): Promise<ResourceWithRelations[]>;
  create(draft: ResourceDraft): Promise<ResourceWithRelations>;
  update(id: string, patch: Partial<ResourceDraft>): Promise<ResourceWithRelations>;
}

export interface ReservationRepository {
  findById(id: string): Promise<ReservationWithRelations | null>;
  findByCode(code: string): Promise<ReservationWithRelations | null>;
  list(filter: ReservationFilter): Promise<ReservationWithRelations[]>;

  /** Inserts only if the slot is still free. */
  createGuarded(input: NewReservation): Promise<GuardedInsert>;

  /** Moves a reservation to a new slot under the same no-overlap guard. */
  rescheduleGuarded(id: string, startsAt: Date, endsAt: Date, patch?: Partial<Pick<Reservation, "title" | "attendees">>): Promise<GuardedInsert>;

  /** Confirms a pending request under that same guard. */
  confirmGuarded(id: string, patch: Pick<Reservation, "decidedBy" | "decidedAt" | "decisionNote">): Promise<GuardedInsert>;

  update(id: string, patch: Partial<Omit<Reservation, "id" | "code" | "createdAt">>): Promise<Reservation>;

  /** Reservations blocking a slot, ignoring one id (used when editing). */
  findOverlapping(resourceId: string, startsAt: Date, endsAt: Date, ignoreId?: string): Promise<ReservationWithRelations[]>;

  nextCode(): Promise<string>;
}

export interface SeriesRepository {
  create(input: { rule: RecurrenceRule; until: Date; createdBy: string }): Promise<RecurrenceSeries>;
  findById(id: string): Promise<RecurrenceSeries | null>;
}

export interface BlackoutRepository {
  list(resourceIds: string[], from: Date, to: Date): Promise<Blackout[]>;
  findOverlapping(resourceId: string, startsAt: Date, endsAt: Date): Promise<Blackout[]>;
  create(input: Omit<Blackout, "id">): Promise<Blackout>;
}

export interface NotificationRepository {
  create(input: Omit<Notification, "id" | "createdAt" | "readAt">): Promise<Notification>;
  listForUser(userId: string, limit?: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  markAllRead(userId: string): Promise<void>;
}

export interface AuditRepository {
  create(input: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog>;
  list(limit?: number): Promise<AuditLog[]>;
}

export interface DataStore {
  users: UserRepository;
  catalog: CatalogRepository;
  resources: ResourceRepository;
  reservations: ReservationRepository;
  series: SeriesRepository;
  blackouts: BlackoutRepository;
  notifications: NotificationRepository;
  audit: AuditRepository;

  /**
   * Every write runs inside this, together with its audit row. The in-memory
   * adapter just runs the callback; the Postgres adapter opens a transaction.
   */
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}

export type { Role };
