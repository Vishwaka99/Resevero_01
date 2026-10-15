/** AvailabilityService — the one place that answers "is this slot free, and if not, what else is?". */

import { getDataStore } from "@/lib/data";
import { needsApproval as requiresApproval } from "./approval-policy";
import type { Blackout, Interval, Reservation, ReservationWithRelations, ResourceWithRelations } from "@/lib/domain/types";
import {
  addDaysISO,
  addMinutes,
  durationMinutes,
  endOfLocalDay,
  formatRange,
  fromLocal,
  localToday,
  localWeekday,
  minutesFromMidnight,
  overlaps,
  startOfLocalDay,
  toDecimalHour,
  toLocalDayISO,
} from "@/lib/domain/time";

/** A room is held for its owner for this long before the slot is given up. */
export const CHECK_IN_LEAD_MINUTES = 15;
export const AUTO_RELEASE_MINUTES = 15;

export type SlotRequest = {
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  attendees?: number;
  /** Set when editing, so a reservation does not clash with itself. */
  ignoreReservationId?: string;
};

export type ConflictReason =
  | "overlap"
  | "blackout"
  | "closed"
  | "closed_day"
  | "past"
  | "too_long"
  | "too_short"
  | "too_far_ahead"
  | "not_bookable"
  | "over_capacity"
  | "misaligned";

export type Suggestion = {
  startsAt: Date;
  endsAt: Date;
  label: string;
};

export type SimilarResource = {
  resource: ResourceWithRelations;
  label: string;
};

export type AvailabilityCheck = {
  free: boolean;
  /** True when the resource is configured to need an admin decision. */
  needsApproval: boolean;
  /** Pending requests from other people for the same time. */
  competing: ReservationWithRelations[];
  reason?: ConflictReason;
  /** One sentence naming the clash, in the product's voice. */
  message?: string;
  conflict?: ReservationWithRelations;
  blackout?: Blackout;
  /** Nearest free times on the same resource, same duration. */
  suggestions: Suggestion[];
  /** Resources of the same type that are free for the requested slot. */
  similarFree: SimilarResource[];
};

export type LaneBlock = {
  start: number;
  end: number;
  title: string;
  kind: "busy" | "mine" | "pending" | "blocked";
  reservationId?: string;
  code?: string;
};

export type ResourceDayAvailability = {
  resource: ResourceWithRelations;
  blocks: LaneBlock[];
  /** Minutes of bookable time still free today. */
  freeMinutes: number;
  bookableMinutes: number;
  /** When the resource next becomes free, or null when it is free now. */
  freeFrom: Date | null;
  /** How long the resource stays free from now, or null when it is busy. */
  freeUntil: Date | null;
  isFreeNow: boolean;
  isOpenToday: boolean;
};

/* ----------------------------------------------------------- open windows */

/** The bookable window of a resource on a local day, or null when closed. */
export function openWindow(resource: ResourceWithRelations, dayISO: string): Interval | null {
  const dayStart = startOfLocalDay(dayISO);
  if (!resource.openDays.includes(localWeekday(dayStart))) return null;
  return { start: fromLocal(dayISO, resource.openMinute), end: fromLocal(dayISO, resource.closeMinute) };
}

function describeBlock(reservation: Reservation, viewerId: string | null): LaneBlock["kind"] {
  if (reservation.status === "pending") return "pending";
  if (viewerId && reservation.userId === viewerId) return "mine";
  return "busy";
}

/* --------------------------------------------------------------- the day */

/**
 * Everything drawn on one timeline row: other people's bookings, the viewer's
 * own, pending requests and maintenance windows.
 */
export async function getDayAvailability(
  resources: ResourceWithRelations[],
  dayISO: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<ResourceDayAvailability[]> {
  const store = getDataStore();
  const ids = resources.map((r) => r.id);
  if (!ids.length) return [];

  const from = startOfLocalDay(dayISO);
  const to = endOfLocalDay(dayISO);

  const [bookings, maintenance] = await Promise.all([
    store.reservations.list({ resourceIds: ids, statuses: ["pending", "confirmed"], from, to }),
    store.blackouts.list(ids, from, to),
  ]);

  return resources.map((resource) => {
    const window = openWindow(resource, dayISO);
    const mine = bookings.filter((b) => b.resourceId === resource.id);
    const blocked = maintenance.filter((b) => b.resourceId === resource.id);

    const blocks: LaneBlock[] = [
      ...mine.map((booking) => ({
        start: toDecimalHour(booking.startsAt),
        end: toDecimalHour(booking.endsAt),
        title: booking.title,
        kind: describeBlock(booking, viewerId),
        reservationId: booking.id,
        code: booking.code,
      })),
      ...blocked.map((block) => ({
        start: toDecimalHour(block.startsAt),
        end: toDecimalHour(block.endsAt),
        title: block.reason,
        kind: "blocked" as const,
      })),
    ].sort((a, b) => a.start - b.start);

    const bookableMinutes = window ? durationMinutes(window) : 0;
    const takenMinutes = window
      ? [...mine.map((b) => ({ start: b.startsAt, end: b.endsAt })), ...blocked.map((b) => ({ start: b.startsAt, end: b.endsAt }))].reduce(
          (total, interval) => total + overlapMinutes(interval, window),
          0,
        )
      : 0;

    const busyNow =
      resource.status !== "active" ||
      !window ||
      now < window.start ||
      now >= window.end ||
      mine.some((b) => b.startsAt <= now && now < b.endsAt) ||
      blocked.some((b) => b.startsAt <= now && now < b.endsAt);

    const upcoming = [...mine.map((b) => b.startsAt), ...blocked.map((b) => b.startsAt)].filter((start) => start > now).sort((a, b) => a.getTime() - b.getTime());

    return {
      resource,
      blocks,
      bookableMinutes,
      freeMinutes: Math.max(0, bookableMinutes - takenMinutes),
      isOpenToday: Boolean(window),
      isFreeNow: !busyNow,
      freeUntil: !busyNow ? (upcoming[0] ?? window?.end ?? null) : null,
      freeFrom: busyNow ? nextFreeMoment(now, mine, blocked, window) : null,
    };
  });
}

function overlapMinutes(a: Interval, b: Interval): number {
  const start = Math.max(a.start.getTime(), b.start.getTime());
  const end = Math.min(a.end.getTime(), b.end.getTime());
  return end > start ? Math.round((end - start) / 60000) : 0;
}

function nextFreeMoment(now: Date, bookings: Reservation[], blocked: Blackout[], window: Interval | null): Date | null {
  if (!window) return null;
  let cursor = now < window.start ? window.start : now;
  const busy = [
    ...bookings.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    ...blocked.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  let moved = true;
  while (moved) {
    moved = false;
    for (const interval of busy) {
      if (interval.start <= cursor && cursor < interval.end) {
        cursor = interval.end;
        moved = true;
      }
    }
  }
  return cursor < window.end ? cursor : null;
}

/* -------------------------------------------------------------- the check */

/** Every rule a slot must satisfy, checked in the order a person would ask. */
export async function checkSlot(request: SlotRequest, now: Date = new Date()): Promise<AvailabilityCheck> {
  const store = getDataStore();
  const resource = await store.resources.findById(request.resourceId);

  const empty: AvailabilityCheck = { free: false, needsApproval: false, competing: [], suggestions: [], similarFree: [] };
  if (!resource) return { ...empty, reason: "not_bookable", message: "That resource no longer exists." };

  const needsApproval = requiresApproval();
  const base = { ...empty, needsApproval };
  const { startsAt, endsAt } = request;
  const minutes = durationMinutes({ start: startsAt, end: endsAt });
  const dayISO = toLocalDayISO(startsAt);

  if (resource.status === "retired") {
    return { ...base, reason: "not_bookable", message: `${resource.name} has been retired and can no longer be booked.` };
  }
  if (resource.status === "maintenance") {
    return { ...base, reason: "not_bookable", message: `${resource.name} is under maintenance and can't be booked right now.` };
  }
  if (minutes <= 0) {
    return { ...base, reason: "too_short", message: "The end time has to be after the start time." };
  }
  if (endsAt <= now) {
    return { ...base, reason: "past", message: "That time has already passed. Pick a time in the future." };
  }
  if (request.attendees != null && request.attendees > resource.capacity) {
    return {
      ...base,
      reason: "over_capacity",
      message: `${resource.name} holds ${resource.capacity}. Reduce the number of people or pick a bigger resource.`,
      similarFree: await findSimilarFree(resource, startsAt, endsAt, request.attendees),
    };
  }
  if (minutes > resource.maxMinutes) {
    return {
      ...base,
      reason: "too_long",
      message: `${resource.name} can be booked for up to ${Math.floor(resource.maxMinutes / 60)} h at a time.`,
    };
  }
  if (minutes % resource.slotMinutes !== 0 || minutesFromMidnight(startsAt) % resource.slotMinutes !== 0) {
    return {
      ...base,
      reason: "misaligned",
      message: `${resource.name} is booked in ${resource.slotMinutes}-minute slots.`,
    };
  }
  if (startsAt > addMinutes(now, resource.bookAheadDays * 24 * 60)) {
    return { ...base, reason: "too_far_ahead", message: `${resource.name} can be booked up to ${resource.bookAheadDays} days ahead.` };
  }

  const window = openWindow(resource, dayISO);
  if (!window) {
    return { ...base, reason: "closed_day", message: `${resource.name} isn't bookable on that day.` };
  }
  if (startsAt < window.start || endsAt > window.end) {
    return {
      ...base,
      reason: "closed",
      message: `${resource.name} is bookable ${formatRange(window.start, window.end)}. Pick a time inside those hours.`,
      suggestions: await findSuggestions(resource, dayISO, minutes, now, request.ignoreReservationId),
    };
  }

  const blackout = (await store.blackouts.findOverlapping(resource.id, startsAt, endsAt))[0];
  if (blackout) {
    return {
      ...base,
      reason: "blackout",
      message: `${resource.name} is blocked ${formatRange(blackout.startsAt, blackout.endsAt)} for ${blackout.reason.toLowerCase()}. Pick a free time or another resource.`,
      blackout,
      suggestions: await findSuggestions(resource, dayISO, minutes, now, request.ignoreReservationId),
      similarFree: await findSimilarFree(resource, startsAt, endsAt, request.attendees),
    };
  }

  const conflict = (await store.reservations.findOverlapping(resource.id, startsAt, endsAt, request.ignoreReservationId))[0];
  if (conflict) {
    return {
      ...base,
      reason: "overlap",
      message: `${resource.name} is already booked ${formatRange(conflict.startsAt, conflict.endsAt)}. Pick a free time or another resource.`,
      conflict,
      suggestions: await findSuggestions(resource, dayISO, minutes, now, request.ignoreReservationId),
      similarFree: await findSimilarFree(resource, startsAt, endsAt, request.attendees),
    };
  }

  // Nothing owns the slot. Other people may still have asked for it, which is
  // worth saying out loud without standing in the way.
  const competing = (await store.reservations.list({ resourceIds: [resource.id], statuses: ["pending"] })).filter(
    (other) => other.id !== request.ignoreReservationId && other.startsAt < endsAt && startsAt < other.endsAt,
  );

  return { free: true, needsApproval, competing, suggestions: [], similarFree: [] };
}

/* ---------------------------------------------------------------- slots */

export type FreeSlot = { startsAt: Date; endsAt: Date; taken: boolean; label: string };

/** Every slot of a resource's day, marked free or taken. Drives the slot grid. */
export async function listDaySlots(
  resource: ResourceWithRelations,
  dayISO: string,
  slotMinutes = resource.slotMinutes,
  now: Date = new Date(),
): Promise<FreeSlot[]> {
  const store = getDataStore();
  const window = openWindow(resource, dayISO);
  if (!window) return [];

  const [bookings, blocked] = await Promise.all([
    store.reservations.list({ resourceIds: [resource.id], statuses: ["pending", "confirmed"], from: window.start, to: window.end }),
    store.blackouts.list([resource.id], window.start, window.end),
  ]);
  const busy: Interval[] = [
    ...bookings.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    ...blocked.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];

  const slots: FreeSlot[] = [];
  for (let cursor = window.start; cursor < window.end; cursor = addMinutes(cursor, slotMinutes)) {
    const end = addMinutes(cursor, slotMinutes);
    if (end > window.end) break;
    const interval = { start: cursor, end };
    slots.push({
      startsAt: cursor,
      endsAt: end,
      taken: end <= now || busy.some((b) => overlaps(b, interval)),
      label: formatRange(cursor, end),
    });
  }
  return slots;
}

/** The nearest free windows of the requested length, today then tomorrow. */
export async function findSuggestions(
  resource: ResourceWithRelations,
  dayISO: string,
  minutes: number,
  now: Date = new Date(),
  ignoreReservationId?: string,
  limit = 3,
): Promise<Suggestion[]> {
  const store = getDataStore();
  const found: Suggestion[] = [];

  for (const offset of [0, 1, 2]) {
    if (found.length >= limit) break;
    const day = addDaysISO(dayISO, offset);
    const window = openWindow(resource, day);
    if (!window) continue;

    const [bookings, blocked] = await Promise.all([
      store.reservations.list({ resourceIds: [resource.id], statuses: ["pending", "confirmed"], from: window.start, to: window.end }),
      store.blackouts.list([resource.id], window.start, window.end),
    ]);
    const busy: Interval[] = [
      ...bookings.filter((b) => b.id !== ignoreReservationId).map((b) => ({ start: b.startsAt, end: b.endsAt })),
      ...blocked.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    ];

    for (let cursor = window.start; cursor < window.end; cursor = addMinutes(cursor, resource.slotMinutes)) {
      if (found.length >= limit) break;
      const end = addMinutes(cursor, minutes);
      if (end > window.end) break;
      if (end <= now) continue;
      const interval = { start: cursor, end };
      if (busy.some((b) => overlaps(b, interval))) continue;
      found.push({
        startsAt: cursor,
        endsAt: end,
        label: offset === 0 ? formatRange(cursor, end) : `${dayLabel(day)} ${formatRange(cursor, end)}`,
      });
    }
  }

  return found;
}

function dayLabel(dayISO: string): string {
  const today = localToday();
  if (dayISO === today) return "";
  if (dayISO === addDaysISO(today, 1)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(startOfLocalDay(dayISO));
}

/** Resources like the chosen one that are free for exactly the asked slot. */
export async function findSimilarFree(
  resource: ResourceWithRelations,
  startsAt: Date,
  endsAt: Date,
  attendees?: number,
  limit = 3,
): Promise<SimilarResource[]> {
  const store = getDataStore();
  const candidates = await store.resources.list({
    typeId: resource.typeId,
    status: "active",
    minCapacity: attendees ?? undefined,
  });

  const results: SimilarResource[] = [];
  for (const candidate of candidates) {
    if (results.length >= limit) break;
    if (candidate.id === resource.id) continue;

    const window = openWindow(candidate, toLocalDayISO(startsAt));
    if (!window || startsAt < window.start || endsAt > window.end) continue;

    const [clash, blocked] = await Promise.all([
      store.reservations.findOverlapping(candidate.id, startsAt, endsAt),
      store.blackouts.findOverlapping(candidate.id, startsAt, endsAt),
    ]);
    if (clash.length || blocked.length) continue;

    results.push({
      resource: candidate,
      label: `${candidate.name} · ${candidate.capacity === 1 ? candidate.location.name : `${candidate.capacity} seats`}`,
    });
  }
  return results;
}

/** Whether check-in is open for a reservation right now. */
export function checkInWindow(reservation: Reservation, now: Date = new Date()) {
  const opensAt = addMinutes(reservation.startsAt, -CHECK_IN_LEAD_MINUTES);
  const closesAt = addMinutes(reservation.startsAt, AUTO_RELEASE_MINUTES);
  return { opensAt, closesAt, isOpen: now >= opensAt && now <= closesAt && !reservation.checkedInAt };
}

export { overlaps };
