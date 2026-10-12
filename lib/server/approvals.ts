/**
 * ApprovalService — the admin decision on a request for a resource that needs
 * sign-off.
 *
 * Approving is the interesting case: once a request is confirmed, any other
 * pending request for the same resource and time can no longer succeed, so they
 * are rejected in the same transaction and their requesters are told why. That
 * is the behaviour the approvals screen promises.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { ReservationWithRelations } from "@/lib/domain/types";
import { formatRange, formatWhen } from "@/lib/domain/time";
import { notFound, ruleViolation } from "./errors";

export type ApprovalQueueItem = {
  reservation: ReservationWithRelations;
  /** Other pending requests that clash with this one. */
  overlaps: ReservationWithRelations[];
  requesterStats: { bookingsThisMonth: number; noShowsThisMonth: number };
};

export async function listApprovalQueue(now: Date = new Date()): Promise<ApprovalQueueItem[]> {
  const store = getDataStore();
  const pending = await store.reservations.list({ statuses: ["pending"], from: now });

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const history = await store.reservations.list({ from: monthStart });

  return pending
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((reservation) => {
      const theirs = history.filter((r) => r.userId === reservation.userId);
      return {
        reservation,
        overlaps: pending.filter(
          (other) =>
            other.id !== reservation.id &&
            other.resourceId === reservation.resourceId &&
            other.startsAt < reservation.endsAt &&
            reservation.startsAt < other.endsAt,
        ),
        requesterStats: {
          bookingsThisMonth: theirs.filter((r) => r.status === "confirmed" || r.status === "completed").length,
          noShowsThisMonth: theirs.filter((r) => r.cancelReason?.startsWith("Released automatically")).length,
        },
      };
    });
}

export type ApproveResult = {
  reservation: ReservationWithRelations;
  /** Requests that could no longer stand once this one was approved. */
  autoRejected: ReservationWithRelations[];
};

export async function approveReservation(actor: AuthUser, id: string, note: string | null, now: Date = new Date()): Promise<ApproveResult> {
  const store = getDataStore();
  const reservation = await store.reservations.findById(id);
  if (!reservation) throw notFound("That request");
  if (reservation.status !== "pending") throw ruleViolation("That request has already been decided.");
  if (reservation.startsAt <= now) throw ruleViolation("That request's start time has already passed.");

  // A pending request does not hold the slot, so something may have been
  // confirmed in the meantime. Approving is the moment the slot is claimed,
  // and it has to be free right now.
  const taken = await store.reservations.findOverlapping(reservation.resourceId, reservation.startsAt, reservation.endsAt, reservation.id);
  if (taken.length) {
    throw ruleViolation(
      `${reservation.resource.name} was booked for ${formatRange(taken[0].startsAt, taken[0].endsAt)} while this request was waiting. Reject it with a reason, or suggest another time.`,
    );
  }

  const blocked = await store.blackouts.findOverlapping(reservation.resourceId, reservation.startsAt, reservation.endsAt);
  if (blocked.length) {
    throw ruleViolation(`${reservation.resource.name} is blocked for ${blocked[0].reason.toLowerCase()} at that time. Reject the request with a reason.`);
  }

  return store.runInTransaction(async () => {
    await store.reservations.update(reservation.id, {
      status: "confirmed",
      decidedBy: actor.id,
      decidedAt: now,
      decisionNote: note,
    });

    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: reservation.id,
      action: "reservation.approve",
      diff: { note },
    });

    await store.notifications.create({
      userId: reservation.userId,
      reservationId: reservation.id,
      kind: "approved",
      title: `${reservation.resource.name} is approved for ${formatWhen(reservation.startsAt, reservation.endsAt)}`,
      body: note ?? "A calendar invite is on its way to your email.",
    });

    // Clashing requests cannot be granted any more, so close them now rather
    // than leaving people waiting for an answer that can't come.
    const clashing = (await store.reservations.list({ resourceIds: [reservation.resourceId], statuses: ["pending"] })).filter(
      (other) => other.id !== reservation.id && other.startsAt < reservation.endsAt && reservation.startsAt < other.endsAt,
    );

    const autoRejected: ReservationWithRelations[] = [];
    for (const other of clashing) {
      await store.reservations.update(other.id, {
        status: "rejected",
        decidedBy: actor.id,
        decidedAt: now,
        decisionNote: `${reservation.resource.name} was given to another request for ${formatWhen(reservation.startsAt, reservation.endsAt)}.`,
      });
      await store.audit.create({
        actorId: actor.id,
        entity: "reservation",
        entityId: other.id,
        action: "reservation.auto_reject",
        diff: { becauseOf: reservation.code },
      });
      await store.notifications.create({
        userId: other.userId,
        reservationId: other.id,
        kind: "rejected",
        title: `${other.resource.name} isn't available for ${formatWhen(other.startsAt, other.endsAt)}`,
        body: "Another request for the same time was approved. Pick a different time or resource.",
      });
      const refreshed = await store.reservations.findById(other.id);
      if (refreshed) autoRejected.push(refreshed);
    }

    const decided = await store.reservations.findById(reservation.id);
    if (!decided) throw notFound("That request");
    return { reservation: decided, autoRejected };
  });
}

export async function rejectReservation(actor: AuthUser, id: string, note: string, now: Date = new Date()): Promise<ReservationWithRelations> {
  const store = getDataStore();
  const reservation = await store.reservations.findById(id);
  if (!reservation) throw notFound("That request");
  if (reservation.status !== "pending") throw ruleViolation("That request has already been decided.");
  if (!note.trim()) throw ruleViolation("Give a reason, so the requester knows what to do next.");

  return store.runInTransaction(async () => {
    await store.reservations.update(reservation.id, {
      status: "rejected",
      decidedBy: actor.id,
      decidedAt: now,
      decisionNote: note.trim(),
    });

    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: reservation.id,
      action: "reservation.reject",
      diff: { note: note.trim() },
    });

    await store.notifications.create({
      userId: reservation.userId,
      reservationId: reservation.id,
      kind: "rejected",
      title: `${reservation.resource.name} request was rejected`,
      body: note.trim(),
    });

    const decided = await store.reservations.findById(reservation.id);
    if (!decided) throw notFound("That request");
    return decided;
  });
}
