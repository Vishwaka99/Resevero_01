/**
 * Schedule view model — the shared day timeline, filtered by type and location,
 * plus the detail panel for a selected reservation.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { TimelineRow } from "@/components/ui/AvailabilityTimeline";
import { getDayAvailability, listDaySlots, type FreeSlot } from "@/lib/server/availability";
import { settleOverdue } from "@/lib/server/reservations";
import { addDaysISO, formatDayLong, localToday, startOfLocalDay, toDecimalHour } from "@/lib/domain/time";
import { navSections, tabBarItems, toReservationRow, type NavItem, type NavSection, type ReservationRow } from "./shared";

export type ScheduleFilterOption = { id: string; label: string; count: number; href: string };

export type CompactSlotGroup = {
  resourceId: string;
  resourceName: string;
  meta: string;
  slots: Array<{ label: string; taken: boolean; href: string }>;
};

export type ScheduleView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  dateISO: string;
  dateLabel: string;
  isToday: boolean;
  previousHref: string;
  nextHref: string;
  todayHref: string;
  typeOptions: ScheduleFilterOption[];
  locationOptions: Array<{ id: string; label: string }>;
  activeType: string;
  activeLocation: string;
  rows: TimelineRow[];
  startHour: number;
  endHour: number;
  now: number | undefined;
  selected: ReservationRow | null;
  /** On a phone the timeline is replaced by a slot grid per resource. */
  compactGroups: CompactSlotGroup[] | null;
  emptyMessage: string | null;
};

export async function buildScheduleView(
  user: AuthUser,
  query: { date?: string; type?: string; location?: string; selected?: string; view?: "full" | "compact" },
  now: Date = new Date(),
): Promise<ScheduleView> {
  const store = getDataStore();
  await settleOverdue(now);

  const todayISO = localToday(now);
  const dateISO = query.date ?? todayISO;

  const [types, locations, allResources] = await Promise.all([
    store.catalog.resourceTypes(),
    store.catalog.locations(),
    store.resources.list(),
  ]);

  const bookable = allResources.filter((resource) => resource.status !== "retired");

  const typeOptions: ScheduleFilterOption[] = [
    { id: "all", label: "All", count: bookable.length, href: scheduleHref({ ...query, date: dateISO, type: undefined }) },
    ...types.map((type) => ({
      id: type.id,
      label: type.name === "Room" ? "Rooms" : type.name === "Equipment" ? "Equipment" : "Vehicles",
      count: bookable.filter((r) => r.typeId === type.id).length,
      href: scheduleHref({ ...query, date: dateISO, type: type.id }),
    })),
  ];

  const activeType = query.type && types.some((t) => t.id === query.type) ? query.type : "all";
  const activeLocation = query.location && locations.some((l) => l.id === query.location) ? query.location : "all";

  const shown = bookable.filter(
    (resource) => (activeType === "all" || resource.typeId === activeType) && (activeLocation === "all" || resource.locationId === activeLocation),
  );

  const availability = await getDayAvailability(shown, dateISO, user.id, now);

  const rows: TimelineRow[] = availability.map((row) => ({
    id: row.resource.id,
    name: row.resource.name,
    meta: `${row.resource.location.name} · ${row.resource.capacity > 1 ? `${row.resource.capacity} seats` : row.resource.type.name}`,
    href: `/resources/${row.resource.id}`,
    openFrom: row.resource.openMinute / 60,
    openTo: row.resource.closeMinute / 60,
    closedAllDay: !row.isOpenToday,
    blocks: row.blocks.map((block) => ({
      start: block.start,
      end: block.end,
      title: block.title,
      kind: block.kind,
      href: block.reservationId ? scheduleHref({ ...query, date: dateISO, selected: block.reservationId }) : undefined,
    })),
  }));

  // The timeline spans the widest bookable window of the resources shown.
  const openMinutes = availability.filter((row) => row.isOpenToday).map((row) => row.resource.openMinute);
  const closeMinutes = availability.filter((row) => row.isOpenToday).map((row) => row.resource.closeMinute);
  const startHour = openMinutes.length ? Math.floor(Math.min(...openMinutes) / 60) : 8;
  const endHour = closeMinutes.length ? Math.ceil(Math.max(...closeMinutes) / 60) : 18;

  const selectedReservation = query.selected ? await store.reservations.findById(query.selected) : null;

  let compactGroups: CompactSlotGroup[] | null = null;
  if (query.view === "compact") {
    compactGroups = [];
    for (const row of availability.slice(0, 8)) {
      const slots: FreeSlot[] = await listDaySlots(row.resource, dateISO, row.resource.slotMinutes, now);
      compactGroups.push({
        resourceId: row.resource.id,
        resourceName: row.resource.name,
        meta: row.resource.location.name,
        slots: slots.map((slot) => ({
          label: slot.label,
          taken: slot.taken,
          href: `/reservations/new?resourceId=${row.resource.id}&date=${dateISO}&from=${slot.label.slice(0, 5)}`,
        })),
      });
    }
  }

  return {
    user,
    nav: navSections(user, user.role === "admin" ? (await store.reservations.list({ statuses: ["pending"], from: now })).length : 0),
    tabBar: tabBarItems(user),
    dateISO,
    dateLabel: formatDayLong(startOfLocalDay(dateISO)),
    isToday: dateISO === todayISO,
    previousHref: scheduleHref({ ...query, date: addDaysISO(dateISO, -1), selected: undefined }),
    nextHref: scheduleHref({ ...query, date: addDaysISO(dateISO, 1), selected: undefined }),
    todayHref: scheduleHref({ ...query, date: todayISO, selected: undefined }),
    typeOptions,
    locationOptions: [{ id: "all", label: "All buildings" }, ...locations.map((l) => ({ id: l.id, label: l.name }))],
    activeType,
    activeLocation,
    rows,
    startHour,
    endHour,
    now: dateISO === todayISO ? toDecimalHour(now) : undefined,
    selected: selectedReservation ? toReservationRow(selectedReservation, user, { now }) : null,
    compactGroups,
    emptyMessage: rows.length ? null : "No resources match these filters. Clear them to see the whole day.",
  };
}

function scheduleHref(query: { date?: string; type?: string; location?: string; selected?: string }): string {
  const params = new URLSearchParams();
  if (query.date) params.set("date", query.date);
  if (query.type && query.type !== "all") params.set("type", query.type);
  if (query.location && query.location !== "all") params.set("location", query.location);
  if (query.selected) params.set("selected", query.selected);
  const search = params.toString();
  return search ? `/schedule?${search}` : "/schedule";
}
