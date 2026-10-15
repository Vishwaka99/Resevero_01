/**
 * New reservation and edit reservation.
 *
 * The form asks the BFF for availability as the user types, so a clash shows up
 * with alternatives before anything is submitted. `Reserve` stays disabled
 * while a clash stands.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { TimelineRow } from "@/components/ui/AvailabilityTimeline";
import { checkSlot, type AvailabilityCheck } from "@/lib/server/availability";
import { getDayAvailability } from "@/lib/server/availability";
import {
  addDaysISO,
  durationMinutes,
  formatDay,
  formatDuration,
  formatRange,
  formatTime,
  fromLocal,
  localToday,
  startOfLocalDay,
  toDecimalHour,
} from "@/lib/domain/time";
import { navSections, tabBarItems, type NavItem, type NavSection } from "./shared";

export type AvailabilityAnswer = {
  free: boolean;
  needsApproval: boolean;
  /** Null when the slot is free; otherwise one sentence naming the clash. */
  conflict: { reason: string; message: string; conflictTitle?: string; conflictRange?: string } | null;
  /** Someone else has already asked for this time and is waiting on an admin. */
  competing: string | null;
  suggestions: Array<{ label: string; from: string; to: string; date: string }>;
  similarFree: Array<{ id: string; name: string; label: string }>;
  durationLabel: string;
  summary: { resourceName: string; whenLabel: string; approvalLabel: string };
};

/** The live check behind `GET /api/bff/availability`. */
export async function buildAvailabilityAnswer(
  query: { resourceId: string; date: string; from: string; to: string; attendees?: number; ignore?: string },
  now: Date = new Date(),
): Promise<AvailabilityAnswer> {
  const store = getDataStore();
  const startsAt = fromLocal(query.date, toMinutes(query.from));
  const endsAt = fromLocal(query.date, toMinutes(query.to));

  const check = await checkSlot(
    {
      resourceId: query.resourceId,
      startsAt,
      endsAt,
      attendees: query.attendees,
      ignoreReservationId: query.ignore,
    },
    now,
  );

  const resource = await store.resources.findById(query.resourceId);
  const minutes = Math.max(0, durationMinutes({ start: startsAt, end: endsAt }));

  return {
    free: check.free,
    needsApproval: check.needsApproval,
    conflict: toConflict(check),
    competing: describeCompeting(check),
    suggestions: check.suggestions.map((suggestion) => ({
      label: suggestion.label || formatRange(suggestion.startsAt, suggestion.endsAt),
      from: formatTime(suggestion.startsAt),
      to: formatTime(suggestion.endsAt),
      date: query.date,
    })),
    similarFree: check.similarFree.map((item) => ({ id: item.resource.id, name: item.resource.name, label: item.label })),
    durationLabel: minutes ? formatDuration(minutes) : "—",
    summary: {
      resourceName: resource?.name ?? "—",
      whenLabel: minutes ? `${formatDay(startsAt)} · ${formatRange(startsAt, endsAt)}` : "—",
      approvalLabel: check.needsApproval
        ? "Needed: an admin decides, and you'll see it on your reservations"
        : "Not needed",
    },
  };
}

function describeCompeting(check: AvailabilityCheck): string | null {
  if (!check.competing.length) return null;

  const [first] = check.competing;
  const others = check.competing.length - 1;
  const tail = others === 0 ? "" : others === 1 ? ", and so has one other person" : `, and so have ${others} other people`;
  return `${first.user.name} has already asked for ${formatRange(first.startsAt, first.endsAt)}${tail}. You can still send a request — an admin decides between them.`;
}

function toConflict(check: AvailabilityCheck): AvailabilityAnswer["conflict"] {
  if (check.free || !check.reason) return null;
  return {
    reason: check.reason,
    message: check.message ?? "That time isn't available.",
    conflictTitle: check.conflict?.title,
    conflictRange: check.conflict ? formatRange(check.conflict.startsAt, check.conflict.endsAt) : undefined,
  };
}

/* --------------------------------------------------------------- page */

export type ReservationFormView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  mode: "create" | "edit";
  reservationId: string | null;
  resourceOptions: Array<{ id: string; label: string; needsApproval: boolean; capacity: number; slotMinutes: number }>;
  values: { resourceId: string; title: string; attendees: number; date: string; from: string; to: string; repeat: string; repeatUntil: string };
  availability: AvailabilityAnswer;
  timeline: { rows: TimelineRow[]; startHour: number; endHour: number; now: number | undefined; dateLabel: string };
  minDateISO: string;
  maxDateISO: string;
  backHref: string;
};

export async function buildReservationFormView(
  user: AuthUser,
  query: { resourceId?: string; date?: string; from?: string; to?: string; title?: string; attendees?: string; edit?: string },
  now: Date = new Date(),
): Promise<ReservationFormView> {
  const store = getDataStore();
  const todayISO = localToday(now);

  const existing = query.edit ? await store.reservations.findById(query.edit) : null;
  const bookable = (await store.resources.list({ status: "active" })).filter((resource) => resource.status === "active");

  const resourceId = existing?.resourceId ?? (query.resourceId && bookable.some((r) => r.id === query.resourceId) ? query.resourceId : (bookable[0]?.id ?? ""));
  const resource = bookable.find((r) => r.id === resourceId) ?? bookable[0] ?? null;

  const dateISO = existing ? isoDay(existing.startsAt) : (query.date ?? todayISO);
  const defaultFrom = resource ? asHHMM(roundUpToSlot(resource.openMinute, resource.slotMinutes)) : "09:00";
  const from = existing ? formatTime(existing.startsAt) : (query.from ?? defaultFrom);
  const to = existing
    ? formatTime(existing.endsAt)
    : (query.to ?? asHHMM(Math.min(toMinutes(from) + (resource?.slotMinutes ?? 30) * 2, resource?.closeMinute ?? 18 * 60)));

  const values = {
    resourceId,
    title: existing?.title ?? query.title ?? "",
    attendees: existing?.attendees ?? Number(query.attendees ?? 1),
    date: dateISO,
    from,
    to,
    repeat: existing?.series?.rule ?? "none",
    repeatUntil: existing?.series ? isoDay(existing.series.until) : addDaysISO(dateISO, 56),
  };

  const availability = await buildAvailabilityAnswer(
    { resourceId, date: dateISO, from, to, attendees: values.attendees, ignore: existing?.id },
    now,
  );

  const dayRows = resource ? await getDayAvailability([resource], dateISO, user.id, now) : [];
  const rows: TimelineRow[] = dayRows.map((row) => ({
    id: row.resource.id,
    name: row.resource.name,
    meta: row.resource.location.name,
    openFrom: row.resource.openMinute / 60,
    openTo: row.resource.closeMinute / 60,
    closedAllDay: !row.isOpenToday,
    blocks: [
      ...row.blocks.map((block) => ({ start: block.start, end: block.end, title: block.title, kind: block.kind })),
      // The slot being filled in, drawn on top so the clash is visible.
      {
        start: toDecimalHour(fromLocal(dateISO, toMinutes(from))),
        end: toDecimalHour(fromLocal(dateISO, toMinutes(to))),
        title: values.title || "Your booking",
        kind: "draft" as const,
        conflict: !availability.free,
      },
    ],
  }));

  return {
    user,
    nav: navSections(user, user.role === "admin" ? (await store.reservations.list({ statuses: ["pending"], from: now })).length : 0),
    tabBar: tabBarItems(user),
    mode: existing ? "edit" : "create",
    reservationId: existing?.id ?? null,
    resourceOptions: bookable.map((item) => ({
      id: item.id,
      label: `${item.name} · ${item.location.name}${item.capacity > 1 ? ` · ${item.capacity} seats` : ""}`,
      needsApproval: item.requiresApproval,
      capacity: item.capacity,
      slotMinutes: item.slotMinutes,
    })),
    values,
    availability,
    timeline: {
      rows,
      startHour: resource ? Math.floor(resource.openMinute / 60) : 8,
      endHour: resource ? Math.ceil(resource.closeMinute / 60) : 18,
      now: dateISO === todayISO ? toDecimalHour(now) : undefined,
      dateLabel: formatDay(startOfLocalDay(dateISO)),
    },
    minDateISO: todayISO,
    maxDateISO: addDaysISO(todayISO, resource?.bookAheadDays ?? 60),
    backHref: existing ? "/reservations" : "/resources",
  };
}

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

function asHHMM(minutes: number): string {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function roundUpToSlot(minutes: number, slot: number): number {
  return Math.ceil(minutes / slot) * slot;
}

function isoDay(instant: Date): string {
  return localToday(instant);
}
