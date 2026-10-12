/**
 * ResourceService — the admin side of the catalogue: add a resource, change its
 * rules, block time for maintenance, retire it.
 *
 * Changing a rule never silently cancels bookings. Instead the service reports
 * the reservations that no longer fit the new rules, and the screen shows them
 * so an admin can decide what to do.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { ReservationWithRelations, Resource, ResourceStatus, ResourceWithRelations } from "@/lib/domain/types";
import { durationMinutes, formatRange, formatWhen, localWeekday, minutesFromMidnight } from "@/lib/domain/time";
import type { ResourceDraft } from "@/lib/data/ports";
import { notFound, ruleViolation } from "./errors";

export type ResourceInput = {
  name: string;
  typeId: string;
  locationId: string;
  description: string;
  capacity: number;
  requiresApproval: boolean;
  requiresCheckIn: boolean;
  slotMinutes: number;
  maxMinutes: number;
  openMinute: number;
  closeMinute: number;
  openDays: number[];
  bookAheadDays: number;
  status: ResourceStatus;
  amenities: string[];
  managedBy: string | null;
};

export type UpsertResult = {
  resource: ResourceWithRelations;
  /** Future reservations that break the new rules. Nothing is cancelled. */
  affected: Array<{ reservation: ReservationWithRelations; why: string }>;
};

function draftFrom(input: ResourceInput): ResourceDraft {
  return {
    name: input.name.trim(),
    typeId: input.typeId,
    locationId: input.locationId,
    description: input.description.trim(),
    capacity: input.capacity,
    requiresApproval: input.requiresApproval,
    requiresCheckIn: input.requiresCheckIn,
    slotMinutes: input.slotMinutes,
    maxMinutes: input.maxMinutes,
    openMinute: input.openMinute,
    closeMinute: input.closeMinute,
    openDays: input.openDays,
    bookAheadDays: input.bookAheadDays,
    status: input.status,
    amenities: input.amenities,
    managedBy: input.managedBy,
  };
}

export async function createResource(actor: AuthUser, input: ResourceInput): Promise<UpsertResult> {
  const store = getDataStore();
  if (input.closeMinute <= input.openMinute) throw ruleViolation("The closing time has to be after the opening time.");
  if (!input.openDays.length) throw ruleViolation("Pick at least one day the resource can be booked.");

  return store.runInTransaction(async () => {
    const resource = await store.resources.create(draftFrom(input));
    await store.audit.create({
      actorId: actor.id,
      entity: "resource",
      entityId: resource.id,
      action: "resource.create",
      diff: { name: resource.name, typeId: resource.typeId },
    });
    return { resource, affected: [] };
  });
}

export async function updateResource(actor: AuthUser, id: string, input: ResourceInput, now: Date = new Date()): Promise<UpsertResult> {
  const store = getDataStore();
  const existing = await store.resources.findById(id);
  if (!existing) throw notFound("That resource");
  if (input.closeMinute <= input.openMinute) throw ruleViolation("The closing time has to be after the opening time.");
  if (!input.openDays.length) throw ruleViolation("Pick at least one day the resource can be booked.");

  return store.runInTransaction(async () => {
    const resource = await store.resources.update(id, draftFrom(input));

    await store.audit.create({
      actorId: actor.id,
      entity: "resource",
      entityId: id,
      action: "resource.update",
      diff: diffResource(existing, resource),
    });

    return { resource, affected: await findAffected(resource, now) };
  });
}

function diffResource(before: Resource, after: Resource): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  for (const key of Object.keys(after) as Array<keyof Resource>) {
    const was = JSON.stringify(before[key]);
    const is = JSON.stringify(after[key]);
    if (was !== is) changed[key] = { from: before[key], to: after[key] };
  }
  return changed;
}

/** Future bookings that would not be allowed under the resource's new rules. */
async function findAffected(resource: ResourceWithRelations, now: Date): Promise<UpsertResult["affected"]> {
  const store = getDataStore();
  const upcoming = await store.reservations.list({ resourceIds: [resource.id], statuses: ["pending", "confirmed"], from: now });

  const affected: UpsertResult["affected"] = [];
  for (const reservation of upcoming) {
    const reasons: string[] = [];
    if (reservation.attendees > resource.capacity) reasons.push(`${reservation.attendees} people booked, capacity is now ${resource.capacity}`);
    if (durationMinutes({ start: reservation.startsAt, end: reservation.endsAt }) > resource.maxMinutes) reasons.push("longer than the new maximum");
    if (!resource.openDays.includes(localWeekday(reservation.startsAt))) reasons.push("falls on a day the resource is now closed");
    if (minutesFromMidnight(reservation.startsAt) < resource.openMinute || minutesFromMidnight(reservation.endsAt) > resource.closeMinute) {
      reasons.push(`outside the new hours ${formatRange(reservation.startsAt, reservation.endsAt)}`);
    }
    if (reasons.length) affected.push({ reservation, why: reasons.join("; ") });
  }
  return affected;
}

export async function retireResource(actor: AuthUser, id: string, now: Date = new Date()) {
  const store = getDataStore();
  const existing = await store.resources.findById(id);
  if (!existing) throw notFound("That resource");

  const upcoming = await store.reservations.list({ resourceIds: [id], statuses: ["pending", "confirmed"], from: now });

  return store.runInTransaction(async () => {
    const resource = await store.resources.update(id, { status: "retired" });
    await store.audit.create({
      actorId: actor.id,
      entity: "resource",
      entityId: id,
      action: "resource.retire",
      diff: { upcomingReservations: upcoming.length },
    });
    return { resource, upcoming };
  });
}

/* ---------------------------------------------------------- maintenance */

export type BlockTimeInput = {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
};

export type BlockTimeResult = {
  /** Reservations inside the window. They are cancelled and their owners told. */
  cancelled: ReservationWithRelations[];
};

/**
 * Blocks a maintenance window. Anything already booked inside it is cancelled
 * with the reason, because the resource genuinely will not be available —
 * leaving the bookings in place would be the dishonest option.
 */
export async function blockTime(actor: AuthUser, input: BlockTimeInput, now: Date = new Date()): Promise<BlockTimeResult> {
  const store = getDataStore();
  const resource = await store.resources.findById(input.resourceId);
  if (!resource) throw notFound("That resource");
  if (input.endsAt <= input.startsAt) throw ruleViolation("The end of the block has to be after its start.");
  if (!input.reason.trim()) throw ruleViolation("Give a reason, so people see why the resource is unavailable.");

  const inside = await store.reservations.findOverlapping(input.resourceId, input.startsAt, input.endsAt);

  return store.runInTransaction(async () => {
    const blackout = await store.blackouts.create({
      resourceId: input.resourceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason.trim(),
      createdBy: actor.id,
    });

    await store.audit.create({
      actorId: actor.id,
      entity: "blackout",
      entityId: blackout.id,
      action: "blackout.create",
      diff: { resourceId: input.resourceId, reason: blackout.reason, cancelled: inside.length },
    });

    const cancelled: ReservationWithRelations[] = [];
    for (const reservation of inside) {
      await store.reservations.update(reservation.id, {
        status: "cancelled",
        cancelledAt: now,
        cancelReason: `${resource.name} is blocked for ${blackout.reason.toLowerCase()}.`,
      });
      await store.audit.create({
        actorId: actor.id,
        entity: "reservation",
        entityId: reservation.id,
        action: "reservation.cancel_for_maintenance",
        diff: { blackoutId: blackout.id },
      });
      await store.notifications.create({
        userId: reservation.userId,
        reservationId: reservation.id,
        kind: "maintenance",
        title: `${resource.name} is unavailable ${formatWhen(blackout.startsAt, blackout.endsAt)}`,
        body: `Your reservation was cancelled because of ${blackout.reason.toLowerCase()}. Please book another slot.`,
      });
      const refreshed = await store.reservations.findById(reservation.id);
      if (refreshed) cancelled.push(refreshed);
    }

    return { cancelled };
  });
}
