/** Domain entities, one per table in the ER diagram. */

export type Role = "admin" | "member";

export type ResourceStatus = "active" | "maintenance" | "retired";

export type ReservationStatus = "pending" | "confirmed" | "rejected" | "cancelled" | "completed";

/** Only a confirmed reservation owns a slot, and so takes part in the overlap guard that makes double-booking impossible. */
export const BLOCKING_STATUSES: ReservationStatus[] = ["confirmed"];

/** States that are competing for a slot without owning it. */
export const COMPETING_STATUSES: ReservationStatus[] = ["pending"];

export type NotificationKind =
  | "confirmed"
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "released"
  | "reminder"
  | "maintenance";

export type Department = {
  id: string;
  name: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  /** The Supabase Auth identity this profile signs in with, or null for a profile that has never been linked to one. */
  authUserId: string | null;
  role: Role;
  departmentId: string | null;
  isActive: boolean;
  createdAt: Date;
};

export type ResourceType = {
  id: string;
  name: string;
  /** Icon name from the Reservo icon set: building, monitor, car. */
  icon: string;
};

export type Location = {
  id: string;
  building: string;
  floor: string | null;
  name: string;
};

export type Resource = {
  id: string;
  typeId: string;
  locationId: string;
  name: string;
  description: string;
  capacity: number;
  /** Vans and the auditorium wait for an admin; rooms confirm instantly. */
  requiresApproval: boolean;
  /** Rooms release themselves when nobody claims them. */
  requiresCheckIn: boolean;
  slotMinutes: number;
  maxMinutes: number;
  /** Minutes from midnight, local time: 08:00 is 480. */
  openMinute: number;
  closeMinute: number;
  /** Days of the week the resource can be booked, 0 = Sunday. */
  openDays: number[];
  bookAheadDays: number;
  status: ResourceStatus;
  amenities: string[];
  managedBy: string | null;
  createdAt: Date;
};

export type RecurrenceRule = "weekly" | "weekdays";

export type RecurrenceSeries = {
  id: string;
  rule: RecurrenceRule;
  until: Date;
  createdBy: string;
};

export type Reservation = {
  id: string;
  /** Human-facing reference, e.g. RSV-2041. Unique. */
  code: string;
  resourceId: string;
  userId: string;
  seriesId: string | null;
  title: string;
  attendees: number;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  checkedInAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A maintenance window: the resource cannot be booked while it is open. */
export type Blackout = {
  id: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  createdBy: string;
};

export type Notification = {
  id: string;
  userId: string;
  reservationId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  entity: "reservation" | "resource" | "user" | "blackout";
  entityId: string;
  action: string;
  diff: Record<string, unknown>;
  createdAt: Date;
};

/* ------------------------------------------------------------------ *
 * Composites the services hand to the BFF. These are domain shapes,
 * not display shapes: formatting happens in the view-model mappers.
 * ------------------------------------------------------------------ */

export type ResourceWithRelations = Resource & {
  type: ResourceType;
  location: Location;
};

export type ReservationWithRelations = Reservation & {
  resource: ResourceWithRelations;
  user: User;
  series: RecurrenceSeries | null;
};

/** A half-open interval [start, end). Two intervals clash when they overlap. */
export type Interval = {
  start: Date;
  end: Date;
};
