/**
 * Browse resources and resource detail.
 *
 * Browse answers one question — "what can I book for this time?" — so each card
 * carries a status for the asked window, a day bar and the next free time,
 * rather than a list of bookings.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { BadgeStatus } from "@/components/ui/primitives";
import type { IconName } from "@/components/ui/Icon";
import type { TimelineRow } from "@/components/ui/AvailabilityTimeline";
import { getDayAvailability, listDaySlots, openWindow } from "@/lib/server/availability";
import { settleOverdue } from "@/lib/server/reservations";
import {
  addDaysISO,
  durationMinutes,
  formatDay,
  formatRange,
  formatTime,
  fromLocal,
  localToday,
  localWeekday,
  startOfLocalDay,
  startOfLocalWeekISO,
  toDecimalHour,
} from "@/lib/domain/time";
import { navSections, resourceIcon, tabBarItems, type NavItem, type NavSection } from "./shared";

/* ------------------------------------------------------------- browse */

export type ResourceCard = {
  id: string;
  name: string;
  meta: string;
  description: string;
  icon: IconName;
  capacity: number;
  typeName: string;
  locationName: string;
  status: BadgeStatus;
  statusLabel: string;
  tags: string[];
  /** One cell per slot of the day, for the small availability bar. */
  todayBar: Array<"free" | "busy" | "mine" | "pending" | "blocked">;
  barStartLabel: string;
  barEndLabel: string;
  nextFree: string;
  fitsWindow: boolean;
  detailHref: string;
  reserveHref: string;
};

export type BrowseResourcesView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  cards: ResourceCard[];
  totals: { all: number; shown: number; buildings: number };
  headline: string;
  filters: {
    dateISO: string;
    from: string;
    to: string;
    activeType: string;
    activeLocation: string;
    minCapacity: number;
    amenity: string;
    query: string;
    sort: string;
    typeOptions: Array<{ id: string; label: string; count: number }>;
    locationOptions: Array<{ id: string; label: string }>;
    amenityOptions: string[];
    capacityOptions: Array<{ value: number; label: string }>;
    isFiltered: boolean;
  };
  emptyMessage: string | null;
};

export async function buildBrowseResourcesView(
  user: AuthUser,
  query: {
    date?: string;
    from?: string;
    to?: string;
    type?: string;
    location?: string;
    minCapacity?: number;
    amenity?: string;
    q?: string;
    sort?: string;
  },
  now: Date = new Date(),
): Promise<BrowseResourcesView> {
  const store = getDataStore();
  await settleOverdue(now);

  const todayISO = localToday(now);
  const dateISO = query.date ?? todayISO;
  const from = query.from ?? "09:00";
  const to = query.to ?? "11:00";

  const [types, locations, all] = await Promise.all([
    store.catalog.resourceTypes(),
    store.catalog.locations(),
    store.resources.list(),
  ]);

  const live = all.filter((resource) => resource.status !== "retired");
  const amenityOptions = [...new Set(live.flatMap((resource) => resource.amenities))].sort();

  const activeType = query.type && types.some((t) => t.id === query.type) ? query.type : "all";
  const activeLocation = query.location && locations.some((l) => l.id === query.location) ? query.location : "all";
  const minCapacity = query.minCapacity ?? 0;
  const amenity = query.amenity && amenityOptions.includes(query.amenity) ? query.amenity : "";
  const needle = query.q?.trim().toLowerCase() ?? "";

  const matching = live.filter((resource) => {
    if (activeType !== "all" && resource.typeId !== activeType) return false;
    if (activeLocation !== "all" && resource.locationId !== activeLocation) return false;
    if (minCapacity && resource.capacity < minCapacity) return false;
    if (amenity && !resource.amenities.includes(amenity)) return false;
    if (needle && !`${resource.name} ${resource.description} ${resource.location.name}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  const availability = await getDayAvailability(matching, dateISO, user.id, now);
  const windowStart = fromLocal(dateISO, toMinutes(from));
  const windowEnd = fromLocal(dateISO, toMinutes(to));

  const cards: ResourceCard[] = [];
  for (const row of availability) {
    const resource = row.resource;
    const slots = await listDaySlots(resource, dateISO, resource.slotMinutes, new Date(0));

    const open = openWindow(resource, dateISO);
    let fitsWindow = false;
    if (
      open &&
      resource.status === "active" &&
      windowStart >= open.start &&
      windowEnd <= open.end &&
      durationMinutes({ start: windowStart, end: windowEnd }) <= resource.maxMinutes
    ) {
      const [clashes, blocked] = await Promise.all([
        store.reservations.findOverlapping(resource.id, windowStart, windowEnd),
        store.blackouts.findOverlapping(resource.id, windowStart, windowEnd),
      ]);
      fitsWindow = clashes.length === 0 && blocked.length === 0;
    }

    const { status, statusLabel } = describeStatus(resource.status, fitsWindow, row.isFreeNow);

    cards.push({
      id: resource.id,
      name: resource.name,
      typeName: resource.type.name,
      locationName: resource.location.name,
      description: resource.description,
      icon: resourceIcon(resource),
      capacity: resource.capacity,
      meta: `${resource.type.name} · ${resource.location.name}${resource.capacity > 1 ? ` · up to ${resource.capacity}` : ""}`,
      status,
      statusLabel,
      tags: [
        ...(resource.requiresApproval ? ["Needs approval"] : []),
        ...(resource.requiresCheckIn ? ["Check in required"] : []),
        ...resource.amenities.slice(0, 3),
      ],
      todayBar: slots.map((slot) => {
        const block = row.blocks.find((b) => b.start <= toDecimalHour(slot.startsAt) && toDecimalHour(slot.startsAt) < b.end);
        if (block) return block.kind === "mine" ? "mine" : block.kind === "pending" ? "pending" : block.kind === "blocked" ? "blocked" : "busy";
        return "free";
      }),
      barStartLabel: open ? formatTime(open.start) : "closed",
      barEndLabel: open ? formatTime(open.end) : "",
      nextFree: describeNextFree(row.isFreeNow, row.freeUntil, row.freeFrom, row.isOpenToday, resource.status),
      fitsWindow,
      detailHref: `/resources/${resource.id}`,
      reserveHref: `/reservations/new?resourceId=${resource.id}&date=${dateISO}&from=${from}&to=${to}`,
    });
  }

  const sort = query.sort ?? "match";
  cards.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "capacity") return b.capacity - a.capacity;
    if (sort === "availability") return Number(b.fitsWindow) - Number(a.fitsWindow) || a.name.localeCompare(b.name);
    // Best match: free for the asked window first, then the closest fit in size.
    return Number(b.fitsWindow) - Number(a.fitsWindow) || a.capacity - b.capacity || a.name.localeCompare(b.name);
  });

  const isFiltered = activeType !== "all" || activeLocation !== "all" || minCapacity > 0 || Boolean(amenity) || Boolean(needle);
  const fitting = cards.filter((card) => card.fitsWindow).length;

  return {
    user,
    nav: navSections(user, user.role === "admin" ? (await store.reservations.list({ statuses: ["pending"], from: now })).length : 0),
    tabBar: tabBarItems(user),
    cards,
    totals: {
      all: live.length,
      shown: cards.length,
      buildings: new Set(live.map((resource) => resource.location.building)).size,
    },
    headline: `${live.length} resources across ${new Set(live.map((r) => r.location.building)).size} buildings · ${fitting} free for ${formatDay(windowStart)}, ${formatRange(windowStart, windowEnd)}`,
    filters: {
      dateISO,
      from,
      to,
      activeType,
      activeLocation,
      minCapacity,
      amenity,
      query: query.q ?? "",
      sort,
      typeOptions: [
        { id: "all", label: "All types", count: live.length },
        ...types.map((type) => ({ id: type.id, label: type.name, count: live.filter((r) => r.typeId === type.id).length })),
      ],
      locationOptions: [{ id: "all", label: "All buildings" }, ...locations.map((l) => ({ id: l.id, label: l.name }))],
      amenityOptions,
      capacityOptions: [
        { value: 0, label: "Any" },
        { value: 4, label: "4+" },
        { value: 10, label: "10+" },
        { value: 30, label: "30+" },
      ],
      isFiltered,
    },
    emptyMessage: cards.length
      ? null
      : isFiltered
        ? "Nothing matches these filters. Try a wider time, a smaller capacity or another building."
        : "No resources have been added yet. An admin can add rooms, equipment and vehicles from Manage resources.",
  };
}

function describeStatus(
  resourceStatus: string,
  fitsWindow: boolean,
  freeNow: boolean,
): { status: BadgeStatus; statusLabel: string } {
  if (resourceStatus === "maintenance") return { status: "maintenance", statusLabel: "Maintenance" };
  if (fitsWindow) return { status: "available", statusLabel: "Free for this time" };
  if (freeNow) return { status: "neutral", statusLabel: "Free now, busy then" };
  return { status: "conflict", statusLabel: "Busy" };
}

function describeNextFree(
  freeNow: boolean,
  freeUntil: Date | null,
  freeFrom: Date | null,
  openToday: boolean,
  resourceStatus: string,
): string {
  if (resourceStatus === "maintenance") return "Under maintenance";
  if (!openToday) return "Closed today";
  if (freeNow) return freeUntil ? `Free until ${formatTime(freeUntil)}` : "Free all day";
  return freeFrom ? `Next free at ${formatTime(freeFrom)}` : "Fully booked today";
}

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

/* ------------------------------------------------------------- detail */

export type ResourceDetailView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  resource: {
    id: string;
    name: string;
    description: string;
    typeName: string;
    locationName: string;
    capacity: number;
    icon: IconName;
    status: BadgeStatus;
    statusLabel: string;
    amenities: string[];
    managedByName: string | null;
  };
  specs: Array<{ label: string; value: string }>;
  rules: Array<{ label: string; value: string }>;
  usage: { reservations: number; busiestHourLabel: string; noShows: number; utilisationPercent: number };
  week: {
    rows: TimelineRow[];
    startHour: number;
    endHour: number;
    label: string;
    weekISO: string;
    previousHref: string;
    nextHref: string;
  };
  /** Slot grid for the phone view and for a quick one-tap booking. */
  todaySlots: Array<{ label: string; taken: boolean; href: string }>;
  reserveHref: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
};

export async function buildResourceDetailView(
  user: AuthUser,
  resourceId: string,
  query: { week?: string },
  now: Date = new Date(),
): Promise<ResourceDetailView | null> {
  const store = getDataStore();
  await settleOverdue(now);

  const resource = await store.resources.findById(resourceId);
  if (!resource) return null;

  const todayISO = localToday(now);
  const weekISO = startOfLocalWeekISO(query.week ?? todayISO);
  const weekDays = Array.from({ length: 7 }, (_, offset) => addDaysISO(weekISO, offset)).filter((dayISO) =>
    resource.openDays.includes(localWeekday(startOfLocalDay(dayISO))),
  );

  // One timeline row per day of the week, which reads better than seven lanes
  // of one resource stacked by hour.
  const rows: TimelineRow[] = [];
  for (const dayISO of weekDays) {
    const [day] = await getDayAvailability([resource], dayISO, user.id, now);
    rows.push({
      id: dayISO,
      name: formatDay(startOfLocalDay(dayISO)),
      meta: dayISO === todayISO ? "Today" : undefined,
      openFrom: resource.openMinute / 60,
      openTo: resource.closeMinute / 60,
      closedAllDay: !day.isOpenToday,
      blocks: day.blocks.map((block) => ({ start: block.start, end: block.end, title: block.title, kind: block.kind })),
    });
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const history = await store.reservations.list({ resourceIds: [resource.id], from: thirtyDaysAgo, to: now });
  const counted = history.filter((r) => r.status === "completed" || r.status === "confirmed");

  const hourTally = new Map<number, number>();
  for (const reservation of counted) {
    const hour = Math.floor(toDecimalHour(reservation.startsAt));
    hourTally.set(hour, (hourTally.get(hour) ?? 0) + 1);
  }
  const busiest = [...hourTally.entries()].sort((a, b) => b[1] - a[1])[0];

  let bookableMinutes = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const window = openWindow(resource, addDaysISO(todayISO, -offset));
    if (window) bookableMinutes += durationMinutes(window);
  }
  const bookedMinutes = counted.reduce((total, r) => total + durationMinutes({ start: r.startsAt, end: r.endsAt }), 0);

  const slots = await listDaySlots(resource, todayISO, resource.slotMinutes, now);
  const managedBy = resource.managedBy ? await store.users.findById(resource.managedBy) : null;
  const openToday = openWindow(resource, todayISO);

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const openDaysLabel = describeDays(resource.openDays, dayNames);

  return {
    user,
    nav: navSections(user, user.role === "admin" ? (await store.reservations.list({ statuses: ["pending"], from: now })).length : 0),
    tabBar: tabBarItems(user),
    resource: {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      typeName: resource.type.name,
      locationName: resource.location.name,
      capacity: resource.capacity,
      icon: resourceIcon(resource),
      status:
        resource.status === "maintenance"
          ? "maintenance"
          : resource.status === "retired"
            ? "cancelled"
            : slots.some((slot) => !slot.taken)
              ? "available"
              : "conflict",
      statusLabel:
        resource.status === "maintenance"
          ? "Under maintenance"
          : resource.status === "retired"
            ? "Retired"
            : openToday && openToday.start <= now && now < openToday.end
              ? slots.some((slot) => !slot.taken && slot.startsAt > now)
                ? "Free today"
                : "Fully booked today"
              : "Closed now",
      amenities: resource.amenities,
      managedByName: managedBy?.name ?? null,
    },
    specs: [
      { label: "Type", value: resource.type.name },
      { label: "Location", value: resource.location.name },
      { label: "Capacity", value: resource.capacity > 1 ? `${resource.capacity} people` : "1 at a time" },
      ...(resource.amenities.length ? [{ label: "Includes", value: resource.amenities.join(", ") }] : []),
    ],
    rules: [
      { label: "Bookable hours", value: openToday ? `${openDaysLabel} · ${formatRange(openToday.start, openToday.end)}` : openDaysLabel },
      { label: "Slot length", value: `${resource.slotMinutes} minutes · ${Math.floor(resource.maxMinutes / 60)} h max` },
      { label: "Book ahead", value: `Up to ${resource.bookAheadDays} days` },
      { label: "Approval", value: resource.requiresApproval ? "An admin decides each request" : "Not needed" },
      { label: "Check-in", value: resource.requiresCheckIn ? "Within 15 minutes, or the slot is released" : "Not needed" },
      { label: "Managed by", value: managedBy ? managedBy.name : "Not assigned" },
    ],
    usage: {
      reservations: counted.length,
      busiestHourLabel: busiest ? `${String(busiest[0]).padStart(2, "0")}:00` : "—",
      noShows: history.filter((r) => r.cancelReason?.startsWith("Released automatically")).length,
      utilisationPercent: bookableMinutes ? Math.round((bookedMinutes / bookableMinutes) * 100) : 0,
    },
    week: {
      rows,
      startHour: Math.floor(resource.openMinute / 60),
      endHour: Math.ceil(resource.closeMinute / 60),
      label: `${formatDay(startOfLocalDay(weekISO))} – ${formatDay(startOfLocalDay(addDaysISO(weekISO, 6)))}`,
      weekISO,
      previousHref: `/resources/${resource.id}?week=${addDaysISO(weekISO, -7)}`,
      nextHref: `/resources/${resource.id}?week=${addDaysISO(weekISO, 7)}`,
    },
    todaySlots: slots.map((slot) => ({
      label: slot.label,
      taken: slot.taken,
      href: `/reservations/new?resourceId=${resource.id}&date=${todayISO}&from=${formatTime(slot.startsAt)}&to=${formatTime(slot.endsAt)}`,
    })),
    reserveHref: `/reservations/new?resourceId=${resource.id}`,
    breadcrumbs: [
      { label: "Resources", href: "/resources" },
      { label: resource.type.name, href: `/resources?type=${resource.typeId}` },
      { label: resource.name },
    ],
  };
}

/** "Mon–Fri", "Every day", or a list. */
function describeDays(days: number[], names: string[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return "Every day";
  const weekdays = [1, 2, 3, 4, 5];
  if (sorted.length === 5 && weekdays.every((day) => sorted.includes(day))) return "Mon–Fri";
  return sorted.map((day) => names[day]).join(", ");
}
