/**
 * ReportService — how resources are actually used, so an admin knows what to
 * add, move or retire. Aggregation happens here, not in the components.
 */

import { getDataStore } from "@/lib/data";
import type { ReservationWithRelations } from "@/lib/domain/types";
import { addDaysISO, durationMinutes, endOfLocalDay, localToday, localWeekday, startOfLocalDay, toDecimalHour } from "@/lib/domain/time";
import { openWindow } from "./availability";

export type ReportRange = "7d" | "30d" | "90d";

export const RANGE_LABEL: Record<ReportRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const RANGE_DAYS: Record<ReportRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export type Utilisation = {
  resourceId: string;
  name: string;
  typeName: string;
  /** Percentage of bookable hours that were booked. */
  percent: number;
  bookedMinutes: number;
  bookableMinutes: number;
  reservations: number;
};

export type HeatCell = { weekday: number; hour: number; bookings: number };

export type Outcomes = {
  confirmed: number;
  completed: number;
  cancelled: number;
  rejected: number;
  noShows: number;
};

export type TeamUsage = { team: string; reservations: number; hours: number };

export type ReportData = {
  range: ReportRange;
  from: Date;
  to: Date;
  kpis: { totalReservations: number; hoursBooked: number; averageUtilisation: number; noShowRate: number };
  utilisation: Utilisation[];
  heatmap: HeatCell[];
  busiestHourLabel: string;
  outcomes: Outcomes;
  teams: TeamUsage[];
  approvalTurnaround: { medianMinutes: number | null; decided: number; expired: number };
  /** One honest sentence about the busiest resource, or null when there is nothing to say. */
  highlight: string | null;
};

export async function buildReport(range: ReportRange, now: Date = new Date()): Promise<ReportData> {
  const store = getDataStore();
  const days = RANGE_DAYS[range];
  const todayISO = localToday(now);
  const fromISO = addDaysISO(todayISO, -days + 1);
  const from = startOfLocalDay(fromISO);
  const to = endOfLocalDay(todayISO);

  const [resources, reservations, departments, users] = await Promise.all([
    store.resources.list(),
    store.reservations.list({ from, to }),
    store.catalog.departments(),
    store.users.list(),
  ]);

  const counted = reservations.filter((r) => r.status === "confirmed" || r.status === "completed");

  /* ----------------------------------------------------- utilisation */

  const bookableByResource = new Map<string, number>();
  for (const resource of resources) {
    if (resource.status === "retired") continue;
    let minutes = 0;
    for (let offset = 0; offset < days; offset += 1) {
      const window = openWindow(resource, addDaysISO(fromISO, offset));
      if (window) minutes += durationMinutes(window);
    }
    bookableByResource.set(resource.id, minutes);
  }

  const utilisation: Utilisation[] = resources
    .filter((resource) => resource.status !== "retired")
    .map((resource) => {
      const theirs = counted.filter((r) => r.resourceId === resource.id);
      const bookedMinutes = theirs.reduce((total, r) => total + durationMinutes({ start: r.startsAt, end: r.endsAt }), 0);
      const bookableMinutes = bookableByResource.get(resource.id) ?? 0;
      return {
        resourceId: resource.id,
        name: resource.name,
        typeName: resource.type.name,
        bookedMinutes,
        bookableMinutes,
        percent: bookableMinutes ? Math.round((bookedMinutes / bookableMinutes) * 100) : 0,
        reservations: theirs.length,
      };
    })
    .sort((a, b) => b.percent - a.percent);

  /* --------------------------------------------------------- heatmap */

  const heatmap: HeatCell[] = [];
  const hourTally = new Map<string, number>();
  for (const reservation of counted) {
    const weekday = localWeekday(reservation.startsAt);
    const startHour = Math.floor(toDecimalHour(reservation.startsAt));
    const endHour = Math.ceil(toDecimalHour(reservation.endsAt));
    for (let hour = startHour; hour < endHour; hour += 1) {
      const key = `${weekday}:${hour}`;
      hourTally.set(key, (hourTally.get(key) ?? 0) + 1);
    }
  }
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    for (let hour = 8; hour < 18; hour += 1) {
      heatmap.push({ weekday, hour, bookings: hourTally.get(`${weekday}:${hour}`) ?? 0 });
    }
  }
  const busiest = [...heatmap].sort((a, b) => b.bookings - a.bookings)[0];
  const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const busiestHourLabel =
    busiest && busiest.bookings > 0
      ? `Peak: ${WEEKDAY_NAMES[busiest.weekday]} ${String(busiest.hour).padStart(2, "0")}:00–${String(busiest.hour + 1).padStart(2, "0")}:00`
      : "Not enough bookings yet to show a peak";

  /* -------------------------------------------------------- outcomes */

  const noShows = reservations.filter((r) => r.cancelReason?.startsWith("Released automatically")).length;
  const outcomes: Outcomes = {
    confirmed: reservations.filter((r) => r.status === "confirmed").length,
    completed: reservations.filter((r) => r.status === "completed").length,
    cancelled: reservations.filter((r) => r.status === "cancelled").length - noShows,
    rejected: reservations.filter((r) => r.status === "rejected").length,
    noShows,
  };

  /* ------------------------------------------------------------ teams */

  const departmentById = new Map(departments.map((d) => [d.id, d.name]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const teamTally = new Map<string, { reservations: number; minutes: number }>();
  for (const reservation of counted) {
    const user = userById.get(reservation.userId);
    const team = (user?.departmentId ? departmentById.get(user.departmentId) : null) ?? "Unassigned";
    const current = teamTally.get(team) ?? { reservations: 0, minutes: 0 };
    current.reservations += 1;
    current.minutes += durationMinutes({ start: reservation.startsAt, end: reservation.endsAt });
    teamTally.set(team, current);
  }
  const teams: TeamUsage[] = [...teamTally.entries()]
    .map(([team, value]) => ({ team, reservations: value.reservations, hours: Math.round(value.minutes / 60) }))
    .sort((a, b) => b.reservations - a.reservations);

  /* ---------------------------------------------------- turnaround */

  const decided = reservations.filter((r) => r.decidedAt && r.decidedBy);
  const turnarounds = decided
    .map((r) => Math.round((r.decidedAt!.getTime() - r.createdAt.getTime()) / 60000))
    .filter((minutes) => minutes >= 0)
    .sort((a, b) => a - b);
  const medianMinutes = turnarounds.length ? turnarounds[Math.floor(turnarounds.length / 2)] : null;
  const expired = reservations.filter((r) => r.status === "rejected" && r.decisionNote?.startsWith("Expired")).length;

  /* ------------------------------------------------------------ KPIs */

  const hoursBooked = Math.round(counted.reduce((total, r) => total + durationMinutes({ start: r.startsAt, end: r.endsAt }), 0) / 60);
  const measured = utilisation.filter((u) => u.bookableMinutes > 0);
  const averageUtilisation = measured.length ? Math.round(measured.reduce((total, u) => total + u.percent, 0) / measured.length) : 0;
  const closed = outcomes.completed + outcomes.confirmed + noShows;

  const top = utilisation[0];
  const highlight =
    top && top.percent >= 60
      ? `${top.name} is at ${top.percent}% of its bookable hours. Consider adding a similar ${top.typeName.toLowerCase()} or moving long bookings elsewhere.`
      : top && top.reservations > 0
        ? `The busiest resource is ${top.name} at ${top.percent}%. There is room to take on more bookings.`
        : null;

  return {
    range,
    from,
    to,
    kpis: {
      totalReservations: reservations.length,
      hoursBooked,
      averageUtilisation,
      noShowRate: closed ? Math.round((noShows / closed) * 100) : 0,
    },
    utilisation,
    heatmap,
    busiestHourLabel,
    outcomes,
    teams,
    approvalTurnaround: { medianMinutes, decided: decided.length, expired },
    highlight,
  };
}

/** CSV export of the utilisation table — what an admin takes into a meeting. */
export function utilisationCsv(report: ReportData): string {
  const rows = [
    ["Resource", "Type", "Reservations", "Hours booked", "Bookable hours", "Utilisation %"],
    ...report.utilisation.map((row) => [
      row.name,
      row.typeName,
      String(row.reservations),
      (row.bookedMinutes / 60).toFixed(1),
      (row.bookableMinutes / 60).toFixed(1),
      String(row.percent),
    ]),
  ];
  return rows.map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",")).join("\n");
}

export type { ReservationWithRelations };
