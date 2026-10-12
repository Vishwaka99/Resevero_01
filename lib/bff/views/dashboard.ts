/**
 * Dashboard view model.
 *
 * One call gathers what would otherwise be five separate queries from the
 * browser: the next booking, two dials, today's timeline, what is free right
 * now, the approvals preview and this week's notices.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { GaugeSegment } from "@/components/ui/primitives";
import type { TimelineRow } from "@/components/ui/AvailabilityTimeline";
import type { IconName } from "@/components/ui/Icon";
import { checkInWindow, getDayAvailability } from "@/lib/server/availability";
import { settleOverdue } from "@/lib/server/reservations";
import {
  endOfLocalDay,
  formatDay,
  formatDayLong,
  formatRange,
  formatRelative,
  formatTime,
  localToday,
  startOfLocalDay,
  toDecimalHour,
} from "@/lib/domain/time";
import { navSections, resourceIcon, tabBarItems, toReservationRow, type NavSection, type NavItem, type ReservationRow } from "./shared";

export type FreeNowItem = {
  id: string;
  name: string;
  meta: string;
  icon: IconName;
  reserveHref: string;
  needsApproval: boolean;
};

export type NoticeItem = {
  id: string;
  title: string;
  detail: string;
  isMaintenance: boolean;
};

export type ApprovalPreviewItem = {
  id: string;
  requester: string;
  resourceName: string;
  when: string;
  age: string;
};

export type DashboardView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  unreadCount: number;
  greeting: string;
  subtitle: string;
  upNext: (ReservationRow & { startsIn: string; checkInOpensAt: string }) | null;
  gauges: {
    mine: { segments: GaugeSegment[]; label: string; total: number };
    utilisation: { segments: GaugeSegment[]; label: string; display: string; windowLabel: string };
  };
  timeline: {
    rows: TimelineRow[];
    startHour: number;
    endHour: number;
    now: number;
    typeTabs: Array<{ id: string; label: string; href: string; count: number }>;
    activeType: string;
  };
  freeNow: FreeNowItem[];
  approvalsPreview: ApprovalPreviewItem[] | null;
  pendingApprovals: number;
  notices: NoticeItem[];
};

export async function buildDashboardView(
  user: AuthUser,
  options: { type?: string; now?: Date } = {},
): Promise<DashboardView> {
  const now = options.now ?? new Date();
  const store = getDataStore();

  // Releases unclaimed rooms and closes finished bookings before anything is read.
  await settleOverdue(now);

  const todayISO = localToday(now);
  const dayStart = startOfLocalDay(todayISO);
  const dayEnd = endOfLocalDay(todayISO);

  const [resources, types, mine, unreadCount] = await Promise.all([
    store.resources.list({ status: "active" }),
    store.catalog.resourceTypes(),
    store.reservations.list({ userId: user.id }),
    store.notifications.countUnread(user.id),
  ]);

  const pending = user.role === "admin" ? await store.reservations.list({ statuses: ["pending"], from: now }) : [];

  /* ------------------------------------------------------------ up next */

  const upcomingMine = mine
    .filter((r) => (r.status === "confirmed" || r.status === "pending") && r.endsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const next = upcomingMine[0] ?? null;
  const window = next ? checkInWindow(next, now) : null;
  const upNext = next
    ? {
        ...toReservationRow(next, user, { now, canCheckIn: window?.isOpen && next.resource.requiresCheckIn }),
        startsIn: next.startsAt > now ? formatRelative(next.startsAt, now) : "happening now",
        checkInOpensAt: window ? formatTime(window.opensAt) : "",
      }
    : null;

  /* -------------------------------------------------------------- dials */

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mineThisMonth = mine.filter((r) => r.startsAt >= monthStart);
  const mineSegments: GaugeSegment[] = [
    { label: "Confirmed", value: mineThisMonth.filter((r) => r.status === "confirmed").length },
    { label: "Completed", value: mineThisMonth.filter((r) => r.status === "completed").length, color: "chart-2" },
    { label: "Pending", value: mineThisMonth.filter((r) => r.status === "pending").length, color: "chart-3" },
  ];

  const availability = await getDayAvailability(resources, todayISO, user.id, now);
  const openToday = availability.filter((row) => row.isOpenToday);
  const bookableMinutes = openToday.reduce((total, row) => total + row.bookableMinutes, 0);
  const bookedMinutes = openToday.reduce((total, row) => total + (row.bookableMinutes - row.freeMinutes), 0);

  const byType = (typeId: string) =>
    openToday
      .filter((row) => row.resource.typeId === typeId)
      .reduce((total, row) => total + (row.bookableMinutes - row.freeMinutes), 0);

  const utilisationSegments: GaugeSegment[] = types.map((type) => ({
    label: type.name === "Room" ? "Rooms" : type.name === "Equipment" ? "Equipment" : "Vehicles",
    value: Math.round(byType(type.id) / 60),
  }));

  const utilisationPercent = bookableMinutes ? Math.round((bookedMinutes / bookableMinutes) * 100) : 0;

  // The dial's caption names the hours it actually measured.
  const openMinutes = openToday.map((row) => row.resource.openMinute);
  const closeMinutes = openToday.map((row) => row.resource.closeMinute);
  const asHHMM = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const utilisationWindowLabel = openMinutes.length
    ? `${asHHMM(Math.min(...openMinutes))}–${asHHMM(Math.max(...closeMinutes))}`
    : "nothing open today";

  /* ----------------------------------------------------------- timeline */

  const typeCounts = types.map((type) => ({
    id: type.id,
    label: type.name === "Room" ? "Rooms" : type.name === "Equipment" ? "Equipment" : "Vehicles",
    href: `/dashboard?type=${type.id}`,
    count: resources.filter((r) => r.typeId === type.id).length,
  }));

  const activeType = options.type && types.some((t) => t.id === options.type) ? options.type : (types[0]?.id ?? "");
  const timelineRows: TimelineRow[] = availability
    .filter((row) => row.resource.typeId === activeType)
    .slice(0, 6)
    .map((row) => ({
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
        href: block.reservationId ? `/schedule?date=${todayISO}&selected=${block.reservationId}` : undefined,
      })),
    }));

  /* ----------------------------------------------------------- free now */

  const freeNow: FreeNowItem[] = availability
    .filter((row) => row.isFreeNow)
    .slice(0, 4)
    .map((row) => ({
      id: row.resource.id,
      name: row.resource.name,
      icon: resourceIcon(row.resource),
      needsApproval: row.resource.requiresApproval,
      reserveHref: `/reservations/new?resourceId=${row.resource.id}`,
      meta: [
        row.resource.capacity > 1 ? `${row.resource.capacity} seats` : row.resource.location.name,
        row.resource.requiresApproval
          ? "needs approval"
          : row.freeUntil
            ? `free until ${formatTime(row.freeUntil)}`
            : "free all day",
      ].join(" · "),
    }));

  /* ------------------------------------------------------------ notices */

  // A resource under maintenance is excluded from `resources`, but its notice
  // is exactly the one people need to see, so this looks wider.
  const noticeable = (await store.resources.list()).filter((resource) => resource.status !== "retired");
  const blackouts = await store.blackouts.list(
    noticeable.map((r) => r.id),
    dayStart,
    new Date(dayEnd.getTime() + 6 * 24 * 60 * 60 * 1000),
  );

  const notices: NoticeItem[] = blackouts
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3)
    .map((blackout) => {
      const resource = noticeable.find((r) => r.id === blackout.resourceId);
      return {
        id: blackout.id,
        title: `${resource?.name ?? "A resource"} — ${blackout.reason.toLowerCase()}`,
        detail: `${formatDayLong(blackout.startsAt).replace(/^(\w+)\s/, "$1 ")} · ${formatRange(blackout.startsAt, blackout.endsAt)}`,
        isMaintenance: true,
      };
    });

  /* -------------------------------------------------------- the header */

  const firstName = user.name.split(" ")[0];
  const todayCount = mine.filter((r) => r.startsAt >= dayStart && r.startsAt < dayEnd && (r.status === "confirmed" || r.status === "pending")).length;

  const subtitleParts = [formatDayLong(now)];
  subtitleParts.push(todayCount === 1 ? "you have 1 reservation today" : `you have ${todayCount} reservations today`);
  if (user.role === "admin") {
    subtitleParts.push(pending.length === 1 ? "1 request is waiting for approval" : `${pending.length} requests are waiting for approval`);
  }

  return {
    user,
    nav: navSections(user, pending.length),
    tabBar: tabBarItems(user),
    unreadCount,
    greeting: `Hello, ${firstName}`,
    subtitle: `${subtitleParts.join(" · ")}.`,
    upNext,
    gauges: {
      mine: { segments: mineSegments, label: "Total", total: mineSegments.reduce((a, s) => a + s.value, 0) },
      utilisation: {
        segments: utilisationSegments,
        label: "Booked",
        display: `${utilisationPercent}%`,
        windowLabel: utilisationWindowLabel,
      },
    },
    timeline: {
      rows: timelineRows,
      startHour: 8,
      endHour: 18,
      now: toDecimalHour(now),
      typeTabs: typeCounts,
      activeType,
    },
    freeNow,
    approvalsPreview:
      user.role === "admin"
        ? pending.slice(0, 3).map((reservation) => ({
            id: reservation.id,
            requester: reservation.user.name,
            resourceName: reservation.resource.name,
            when: `${formatDay(reservation.startsAt)} · ${formatRange(reservation.startsAt, reservation.endsAt)}`,
            age: formatRelative(reservation.createdAt, now),
          }))
        : null,
    pendingApprovals: pending.length,
    notices,
  };
}
