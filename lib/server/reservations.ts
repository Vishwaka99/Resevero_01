/**
 * ReservationService — create, edit, cancel, check in, and release no-shows.
 *
 * Every write runs inside a transaction together with its audit row and the
 * notifications it causes, so the log can never drift from the data.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { RecurrenceRule, ReservationWithRelations } from "@/lib/domain/types";
import { addDaysISO, addMinutes, formatRange, formatWhen, fromLocal, minutesFromMidnight, toLocalDayISO } from "@/lib/domain/time";
import { AUTO_RELEASE_MINUTES, checkInWindow, checkSlot, type AvailabilityCheck } from "./availability";
import { DomainError, forbidden, notFound, ruleViolation } from "./errors";

export type CreateReservationInput = {
  resourceId: string;
  title: string;
  attendees: number;
  startsAt: Date;
  endsAt: Date;
  repeat?: { rule: RecurrenceRule; untilISO: string };
};

export type CreateReservationResult =
  | {
      ok: true;
      reservation: ReservationWithRelations;
      /** Occurrences of a repeat that were skipped because the slot was taken. */
      skipped: Array<{ startsAt: Date; endsAt: Date; reason: string }>;
      created: number;
    }
  | { ok: false; check: AvailabilityCheck };

/* --------------------------------------------------------------- create */

export async function createReservation(
  actor: AuthUser,
  input: CreateReservationInput,
  now: Date = new Date(),
): Promise<CreateReservationResult> {
  const store = getDataStore();

  const check = await checkSlot(
    { resourceId: input.resourceId, startsAt: input.startsAt, endsAt: input.endsAt, attendees: input.attendees },
    now,
  );
  if (!check.free) return { ok: false, check };

  const resource = await store.resources.findById(input.resourceId);
  if (!resource) throw notFound("That resource");

  const status = resource.requiresApproval ? "pending" : "confirmed";

  return store.runInTransaction(async () => {
    const series = input.repeat
      ? await store.series.create({ rule: input.repeat.rule, until: fromLocal(input.repeat.untilISO, 23 * 60 + 59), createdBy: actor.id })
      : null;

    const first = await store.reservations.createGuarded({
      resourceId: input.resourceId,
      userId: actor.id,
      seriesId: series?.id ?? null,
      title: input.title,
      attendees: input.attendees,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status,
    });

    // The database had the last word and someone else got there first.
    if (!first.ok) {
      const fresh = await checkSlot(
        { resourceId: input.resourceId, startsAt: input.startsAt, endsAt: input.endsAt, attendees: input.attendees },
        now,
      );
      return { ok: false as const, check: fresh };
    }

    const skipped: Array<{ startsAt: Date; endsAt: Date; reason: string }> = [];
    let created = 1;

    if (input.repeat && series) {
      for (const occurrence of occurrencesAfter(input.startsAt, input.endsAt, input.repeat.rule, input.repeat.untilISO)) {
        const attempt = await store.reservations.createGuarded({
          resourceId: input.resourceId,
          userId: actor.id,
          seriesId: series.id,
          title: input.title,
          attendees: input.attendees,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          status,
        });
        if (attempt.ok) {
          created += 1;
        } else {
          skipped.push({
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            reason: attempt.reason === "overlap" ? `already booked for "${attempt.conflict.title}"` : "blocked for maintenance",
          });
        }
      }
    }

    const reservation = await store.reservations.findById(first.reservation.id);
    if (!reservation) throw notFound("The new reservation");

    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: reservation.id,
      action: "reservation.create",
      diff: { code: reservation.code, resourceId: reservation.resourceId, startsAt: reservation.startsAt, endsAt: reservation.endsAt, status, repeated: created },
    });

    await store.notifications.create({
      userId: actor.id,
      reservationId: reservation.id,
      kind: status === "pending" ? "pending" : "confirmed",
      title:
        status === "pending"
          ? `${resource.name} request sent for approval`
          : `${resource.name} is yours, ${formatWhen(reservation.startsAt, reservation.endsAt)}`,
      body:
        status === "pending"
          ? "We'll email you as soon as an admin decides."
          : "A calendar invite is on its way to your email.",
    });

    if (status === "pending") {
      for (const admin of (await store.users.list()).filter((u) => u.role === "admin" && u.isActive)) {
        await store.notifications.create({
          userId: admin.id,
          reservationId: reservation.id,
          kind: "pending",
          title: `${resource.name} needs your decision`,
          body: `${actor.name} asked for ${formatWhen(reservation.startsAt, reservation.endsAt)}.`,
        });
      }
    }

    return { ok: true as const, reservation, skipped, created };
  });
}

/** Later dates in a repeat, aligned to the first occurrence's time of day. */
function occurrencesAfter(startsAt: Date, endsAt: Date, rule: RecurrenceRule, untilISO: string) {
  const startMinute = minutesFromMidnight(startsAt);
  const lengthMinutes = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
  const occurrences: Array<{ startsAt: Date; endsAt: Date }> = [];

  let dayISO = toLocalDayISO(startsAt);
  const step = rule === "weekly" ? 7 : 1;

  for (let guard = 0; guard < 400; guard += 1) {
    dayISO = addDaysISO(dayISO, step);
    if (dayISO > untilISO) break;

    if (rule === "weekdays") {
      const weekday = new Date(`${dayISO}T00:00:00Z`).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
    }

    const start = fromLocal(dayISO, startMinute);
    occurrences.push({ startsAt: start, endsAt: addMinutes(start, lengthMinutes) });
  }

  return occurrences;
}

/* ----------------------------------------------------------------- edit */

export type EditResult = { ok: true; reservation: ReservationWithRelations } | { ok: false; check: AvailabilityCheck };

export async function rescheduleReservation(
  actor: AuthUser,
  id: string,
  input: { startsAt: Date; endsAt: Date; title?: string; attendees?: number },
  now: Date = new Date(),
): Promise<EditResult> {
  const store = getDataStore();
  const existing = await mustSee(actor, id);

  if (existing.status !== "confirmed" && existing.status !== "pending") {
    throw ruleViolation("Only a confirmed or pending reservation can be moved.");
  }
  if (existing.startsAt <= now) {
    throw ruleViolation("This reservation has already started, so it can't be moved.");
  }

  const check = await checkSlot(
    {
      resourceId: existing.resourceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      attendees: input.attendees ?? existing.attendees,
      ignoreReservationId: existing.id,
    },
    now,
  );
  if (!check.free) return { ok: false, check };

  return store.runInTransaction(async () => {
    const moved = await store.reservations.rescheduleGuarded(existing.id, input.startsAt, input.endsAt, {
      title: input.title,
      attendees: input.attendees,
    });
    if (!moved.ok) {
      const fresh = await checkSlot(
        { resourceId: existing.resourceId, startsAt: input.startsAt, endsAt: input.endsAt, ignoreReservationId: existing.id },
        now,
      );
      return { ok: false as const, check: fresh };
    }

    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: existing.id,
      action: "reservation.reschedule",
      diff: {
        from: { startsAt: existing.startsAt, endsAt: existing.endsAt },
        to: { startsAt: input.startsAt, endsAt: input.endsAt },
      },
    });

    await store.notifications.create({
      userId: existing.userId,
      reservationId: existing.id,
      kind: "confirmed",
      title: `${existing.resource.name} moved to ${formatWhen(input.startsAt, input.endsAt)}`,
      body: actor.id === existing.userId ? "Your reservation was updated." : `${actor.name} moved your reservation.`,
    });

    const reservation = await store.reservations.findById(existing.id);
    if (!reservation) throw notFound("That reservation");
    return { ok: true as const, reservation };
  });
}

/* --------------------------------------------------------------- cancel */

export async function cancelReservation(actor: AuthUser, id: string, reason: string | null, now: Date = new Date()) {
  const store = getDataStore();
  const existing = await mustSee(actor, id);

  if (existing.status === "cancelled" || existing.status === "rejected") {
    throw ruleViolation("That reservation is already closed.");
  }
  if (existing.status === "completed" || existing.endsAt <= now) {
    throw ruleViolation("A reservation that has already finished can't be cancelled.");
  }

  return store.runInTransaction(async () => {
    await store.reservations.update(existing.id, {
      status: "cancelled",
      cancelledAt: now,
      cancelReason: reason,
    });

    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: existing.id,
      action: "reservation.cancel",
      diff: { from: existing.status, reason },
    });

    await store.notifications.create({
      userId: existing.userId,
      reservationId: existing.id,
      kind: "cancelled",
      title: `${existing.resource.name} on ${formatWhen(existing.startsAt, existing.endsAt)} was cancelled`,
      body: actor.id === existing.userId ? "The slot is free for others again." : `${actor.name} cancelled it${reason ? `: ${reason}` : "."}`,
    });

    return store.reservations.findById(existing.id);
  });
}

/* ------------------------------------------------------------- check in */

export async function checkIn(actor: AuthUser, id: string, now: Date = new Date()) {
  const store = getDataStore();
  const existing = await mustSee(actor, id);

  if (existing.status !== "confirmed") throw ruleViolation("Only a confirmed reservation can be checked in.");
  if (existing.checkedInAt) throw ruleViolation("You have already checked in.");

  const window = checkInWindow(existing, now);
  if (now < window.opensAt) {
    throw ruleViolation(`Check-in opens at ${formatRange(window.opensAt, existing.startsAt).split("–")[0]}.`);
  }
  if (now > window.closesAt) {
    throw ruleViolation("Check-in has closed for this reservation and the slot has been released.");
  }

  return store.runInTransaction(async () => {
    await store.reservations.update(existing.id, { checkedInAt: now });
    await store.audit.create({
      actorId: actor.id,
      entity: "reservation",
      entityId: existing.id,
      action: "reservation.check_in",
      diff: { at: now },
    });
    return store.reservations.findById(existing.id);
  });
}

/* --------------------------------------------------- housekeeping sweeps */

/**
 * Releases rooms nobody claimed and closes reservations that have finished.
 *
 * Reservo has no scheduler yet, so this runs at the start of every BFF read.
 * It is idempotent, which is what makes that safe. Moving it to a cron job is a
 * one-line change once the database is in place.
 */
export async function settleOverdue(now: Date = new Date()): Promise<{ released: number; completed: number }> {
  const store = getDataStore();
  const stale = await store.reservations.list({ statuses: ["confirmed", "pending"], to: now });

  let released = 0;
  let completed = 0;

  for (const reservation of stale) {
    const releaseAt = addMinutes(reservation.startsAt, AUTO_RELEASE_MINUTES);

    if (reservation.status === "confirmed" && reservation.resource.requiresCheckIn && !reservation.checkedInAt && now >= releaseAt && now < reservation.endsAt) {
      await store.runInTransaction(async () => {
        await store.reservations.update(reservation.id, {
          status: "cancelled",
          cancelledAt: now,
          cancelReason: `Released automatically: nobody checked in within ${AUTO_RELEASE_MINUTES} minutes.`,
        });
        await store.audit.create({
          actorId: null,
          entity: "reservation",
          entityId: reservation.id,
          action: "reservation.auto_release",
          diff: { startsAt: reservation.startsAt, releasedAt: now },
        });
        await store.notifications.create({
          userId: reservation.userId,
          reservationId: reservation.id,
          kind: "released",
          title: `${reservation.resource.name} was released`,
          body: `Nobody checked in by ${formatRange(releaseAt, reservation.endsAt).split("–")[0]}, so the slot is free for others.`,
        });
      });
      released += 1;
      continue;
    }

    if (reservation.endsAt <= now) {
      if (reservation.status === "confirmed") {
        await store.reservations.update(reservation.id, { status: "completed" });
        completed += 1;
      } else if (reservation.status === "pending") {
        // A request nobody decided before the start time expires.
        await store.runInTransaction(async () => {
          await store.reservations.update(reservation.id, {
            status: "rejected",
            decidedAt: now,
            decisionNote: "Expired: the start time passed before anyone decided.",
          });
          await store.audit.create({
            actorId: null,
            entity: "reservation",
            entityId: reservation.id,
            action: "reservation.expire",
            diff: { startsAt: reservation.startsAt },
          });
          await store.notifications.create({
            userId: reservation.userId,
            reservationId: reservation.id,
            kind: "rejected",
            title: `${reservation.resource.name} request expired`,
            body: "Nobody decided before the start time. Please book another slot.",
          });
        });
      }
    }
  }

  return { released, completed };
}

/* ---------------------------------------------------------------- access */

/** A member sees their own reservations; an admin sees every one. */
export async function mustSee(actor: AuthUser, id: string): Promise<ReservationWithRelations> {
  const store = getDataStore();
  const reservation = await store.reservations.findById(id);
  if (!reservation) throw notFound("That reservation");
  if (actor.role !== "admin" && reservation.userId !== actor.id) {
    throw forbidden("That reservation belongs to someone else.");
  }
  return reservation;
}

export { DomainError };
