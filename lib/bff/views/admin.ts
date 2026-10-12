/**
 * Admin view models: approvals, manage resources, users & roles, reports.
 * Each one is built behind `requireAdmin()`.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { BadgeStatus } from "@/components/ui/primitives";
import type { IconName } from "@/components/ui/Icon";
import { listApprovalQueue } from "@/lib/server/approvals";
import { settleOverdue } from "@/lib/server/reservations";
import { listUsers, PERMISSION_MATRIX } from "@/lib/server/users";
import { buildReport, RANGE_LABEL, type ReportData, type ReportRange } from "@/lib/server/reports";
import { formatDay, formatDuration, formatRange, formatRelative, formatWhen, localToday } from "@/lib/domain/time";
import { navSections, resourceIcon, tabBarItems, type NavItem, type NavSection } from "./shared";

/* ---------------------------------------------------------- approvals */

export type ApprovalListItem = {
  id: string;
  code: string;
  resourceName: string;
  resourceIcon: IconName;
  requester: string;
  title: string;
  when: string;
  age: string;
  isSelected: boolean;
  href: string;
  hasClash: boolean;
};

export type ApprovalDetail = {
  id: string;
  code: string;
  resourceName: string;
  resourceTypeLabel: string;
  requester: string;
  requesterTeam: string | null;
  title: string;
  dayLabel: string;
  timeLabel: string;
  durationLabel: string;
  attendeesLabel: string;
  usageLabel: string;
  /** The sentence explaining what approving this does to clashing requests. */
  clashWarning: string | null;
  suggestHref: string;
};

export type ApprovalsView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  queue: ApprovalListItem[];
  selected: ApprovalDetail | null;
  emptyTitle: string;
  emptyText: string;
};

export async function buildApprovalsView(
  user: AuthUser,
  query: { selected?: string },
  now: Date = new Date(),
): Promise<ApprovalsView> {
  await settleOverdue(now);
  const queue = await listApprovalQueue(now);

  const selectedId = query.selected && queue.some((item) => item.reservation.id === query.selected) ? query.selected : queue[0]?.reservation.id;
  const selectedItem = queue.find((item) => item.reservation.id === selectedId) ?? null;

  return {
    user,
    nav: navSections(user, queue.length),
    tabBar: tabBarItems(user),
    queue: queue.map((item) => ({
      id: item.reservation.id,
      code: item.reservation.code,
      resourceName: item.reservation.resource.name,
      resourceIcon: resourceIcon(item.reservation.resource),
      requester: item.reservation.user.name,
      title: item.reservation.title,
      when: formatWhen(item.reservation.startsAt, item.reservation.endsAt),
      age: `asked ${formatRelative(item.reservation.createdAt, now)}`,
      isSelected: item.reservation.id === selectedId,
      href: `/admin/approvals?selected=${item.reservation.id}`,
      hasClash: item.overlaps.length > 0,
    })),
    selected: selectedItem
      ? {
          id: selectedItem.reservation.id,
          code: selectedItem.reservation.code,
          resourceName: selectedItem.reservation.resource.name,
          resourceTypeLabel: `${selectedItem.reservation.resource.type.name} · ${
            selectedItem.reservation.resource.capacity > 1 ? `${selectedItem.reservation.resource.capacity} seats` : selectedItem.reservation.resource.location.name
          }`,
          requester: selectedItem.reservation.user.name,
          requesterTeam: null,
          title: selectedItem.reservation.title,
          dayLabel: formatDay(selectedItem.reservation.startsAt),
          timeLabel: formatRange(selectedItem.reservation.startsAt, selectedItem.reservation.endsAt),
          durationLabel: formatDuration(
            Math.round((selectedItem.reservation.endsAt.getTime() - selectedItem.reservation.startsAt.getTime()) / 60000),
          ),
          attendeesLabel: `${selectedItem.reservation.attendees} of ${selectedItem.reservation.resource.capacity}`,
          usageLabel: `${selectedItem.requesterStats.bookingsThisMonth} ${
            selectedItem.requesterStats.bookingsThisMonth === 1 ? "booking" : "bookings"
          } this month · ${selectedItem.requesterStats.noShowsThisMonth} no-shows`,
          clashWarning: selectedItem.overlaps.length
            ? `${selectedItem.overlaps
                .map((other) => `${other.code} (${other.user.name}, ${formatRange(other.startsAt, other.endsAt)})`)
                .join(" and ")} ${selectedItem.overlaps.length === 1 ? "wants" : "want"} the same resource. Approving this one rejects ${
                selectedItem.overlaps.length === 1 ? "it" : "them"
              } automatically and says why.`
            : null,
          suggestHref: `/reservations/new?resourceId=${selectedItem.reservation.resource.id}`,
        }
      : null,
    emptyTitle: "Nothing waiting",
    emptyText: "Requests for resources that need sign-off will appear here, oldest first.",
  };
}

/* --------------------------------------------------- manage resources */

export type ManageResourceRow = {
  id: string;
  name: string;
  typeName: string;
  icon: IconName;
  locationName: string;
  capacityLabel: string;
  rulesLabel: string;
  status: BadgeStatus;
  statusLabel: string;
  upcoming: number;
  editHref: string;
};

export type ResourceFormValues = {
  id: string | null;
  name: string;
  typeId: string;
  locationId: string;
  description: string;
  capacity: number;
  requiresApproval: boolean;
  requiresCheckIn: boolean;
  slotMinutes: number;
  maxMinutes: number;
  openFrom: string;
  openTo: string;
  openDays: number[];
  bookAheadDays: number;
  status: string;
  amenities: string;
  managedBy: string;
};

export type ManageResourcesView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  rows: ManageResourceRow[];
  form: ResourceFormValues;
  isEditing: boolean;
  typeOptions: Array<{ id: string; label: string }>;
  locationOptions: Array<{ id: string; label: string }>;
  managerOptions: Array<{ id: string; label: string }>;
  dayOptions: Array<{ value: number; label: string }>;
  blockDefaults: { resourceId: string; date: string; from: string; to: string };
  /** Future bookings that no longer fit the edited resource's rules. */
  affected: Array<{ code: string; resourceName: string; when: string; owner: string; why: string }>;
};

const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export async function buildManageResourcesView(
  user: AuthUser,
  query: { edit?: string },
  now: Date = new Date(),
): Promise<ManageResourcesView> {
  const store = getDataStore();
  const [resources, types, locations, users, pending] = await Promise.all([
    store.resources.list(),
    store.catalog.resourceTypes(),
    store.catalog.locations(),
    store.users.list(),
    store.reservations.list({ statuses: ["pending"], from: now }),
  ]);

  const upcoming = await store.reservations.list({ statuses: ["pending", "confirmed"], from: now });
  const editing = query.edit ? (resources.find((resource) => resource.id === query.edit) ?? null) : null;

  const rows: ManageResourceRow[] = resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    typeName: resource.type.name,
    icon: resourceIcon(resource),
    locationName: resource.location.name,
    capacityLabel: resource.capacity > 1 ? `${resource.capacity} people` : "1 at a time",
    rulesLabel: [
      `${resource.slotMinutes} min slots`,
      `${Math.floor(resource.maxMinutes / 60)} h max`,
      resource.requiresApproval ? "approval" : null,
      resource.requiresCheckIn ? "check-in" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    status: resource.status === "active" ? "available" : resource.status === "maintenance" ? "maintenance" : "cancelled",
    statusLabel: resource.status === "active" ? "Active" : resource.status === "maintenance" ? "Maintenance" : "Retired",
    upcoming: upcoming.filter((reservation) => reservation.resourceId === resource.id).length,
    editHref: `/admin/resources?edit=${resource.id}`,
  }));

  const form: ResourceFormValues = editing
    ? {
        id: editing.id,
        name: editing.name,
        typeId: editing.typeId,
        locationId: editing.locationId,
        description: editing.description,
        capacity: editing.capacity,
        requiresApproval: editing.requiresApproval,
        requiresCheckIn: editing.requiresCheckIn,
        slotMinutes: editing.slotMinutes,
        maxMinutes: editing.maxMinutes,
        openFrom: asHHMM(editing.openMinute),
        openTo: asHHMM(editing.closeMinute),
        openDays: editing.openDays,
        bookAheadDays: editing.bookAheadDays,
        status: editing.status,
        amenities: editing.amenities.join(", "),
        managedBy: editing.managedBy ?? "",
      }
    : {
        id: null,
        name: "",
        typeId: types[0]?.id ?? "",
        locationId: locations[0]?.id ?? "",
        description: "",
        capacity: 4,
        requiresApproval: false,
        requiresCheckIn: true,
        slotMinutes: 30,
        maxMinutes: 240,
        openFrom: "08:00",
        openTo: "18:00",
        openDays: [1, 2, 3, 4, 5],
        bookAheadDays: 60,
        status: "active",
        amenities: "",
        managedBy: "",
      };

  return {
    user,
    nav: navSections(user, pending.length),
    tabBar: tabBarItems(user),
    rows,
    form,
    isEditing: Boolean(editing),
    typeOptions: types.map((type) => ({ id: type.id, label: type.name })),
    locationOptions: locations.map((location) => ({ id: location.id, label: location.name })),
    managerOptions: [{ id: "", label: "Not assigned" }, ...users.filter((u) => u.isActive).map((u) => ({ id: u.id, label: u.name }))],
    dayOptions: DAY_OPTIONS,
    blockDefaults: {
      resourceId: editing?.id ?? resources[0]?.id ?? "",
      date: localToday(now),
      from: "09:00",
      to: "17:00",
    },
    affected: [],
  };
}

function asHHMM(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------- users */

export type UsersView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  rows: Array<{
    id: string;
    name: string;
    email: string;
    team: string;
    role: "admin" | "member";
    roleLabel: string;
    bookings: number;
    status: BadgeStatus;
    statusLabel: string;
    isSelf: boolean;
  }>;
  departmentOptions: Array<{ id: string; label: string }>;
  permissionMatrix: typeof PERMISSION_MATRIX;
  counts: { admins: number; members: number; inactive: number };
};

export async function buildUsersView(user: AuthUser, now: Date = new Date()): Promise<UsersView> {
  const store = getDataStore();
  const [rows, departments, pending] = await Promise.all([
    listUsers(now),
    store.catalog.departments(),
    store.reservations.list({ statuses: ["pending"], from: now }),
  ]);

  return {
    user,
    nav: navSections(user, pending.length),
    tabBar: tabBarItems(user),
    rows: rows.map((row) => ({
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      team: row.departmentName ?? "Unassigned",
      role: row.user.role,
      roleLabel: row.user.role === "admin" ? "Admin" : "Member",
      bookings: row.bookingsLast30Days,
      status: row.user.isActive ? "available" : "cancelled",
      statusLabel: row.user.isActive ? "Active" : "Deactivated",
      isSelf: row.user.id === user.id,
    })),
    departmentOptions: [{ id: "", label: "Unassigned" }, ...departments.map((d) => ({ id: d.id, label: d.name }))],
    permissionMatrix: PERMISSION_MATRIX,
    counts: {
      admins: rows.filter((row) => row.user.role === "admin" && row.user.isActive).length,
      members: rows.filter((row) => row.user.role === "member" && row.user.isActive).length,
      inactive: rows.filter((row) => !row.user.isActive).length,
    },
  };
}

/* ------------------------------------------------------------ reports */

export type ReportsView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  report: ReportData;
  rangeOptions: Array<{ id: ReportRange; label: string; href: string }>;
  activeRange: ReportRange;
  exportHref: string;
  heatRows: Array<{ label: string; cells: Array<{ hour: number; bookings: number; intensity: number }> }>;
  hourLabels: string[];
  turnaroundLabel: string;
};

export async function buildReportsView(user: AuthUser, query: { range?: ReportRange }, now: Date = new Date()): Promise<ReportsView> {
  const store = getDataStore();
  const activeRange = query.range ?? "30d";
  const [report, pending] = await Promise.all([
    buildReport(activeRange, now),
    store.reservations.list({ statuses: ["pending"], from: now }),
  ]);

  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const peak = Math.max(1, ...report.heatmap.map((cell) => cell.bookings));
  const hours = [...new Set(report.heatmap.map((cell) => cell.hour))].sort((a, b) => a - b);

  const heatRows = [1, 2, 3, 4, 5].map((weekday) => ({
    label: weekdayNames[weekday],
    cells: hours.map((hour) => {
      const cell = report.heatmap.find((item) => item.weekday === weekday && item.hour === hour);
      const bookings = cell?.bookings ?? 0;
      return { hour, bookings, intensity: bookings / peak };
    }),
  }));

  return {
    user,
    nav: navSections(user, pending.length),
    tabBar: tabBarItems(user),
    report,
    rangeOptions: (["7d", "30d", "90d"] as const).map((range) => ({
      id: range,
      label: RANGE_LABEL[range],
      href: `/admin/reports?range=${range}`,
    })),
    activeRange,
    exportHref: `/api/bff/admin/reports/export?range=${activeRange}`,
    heatRows,
    hourLabels: hours.map((hour) => `${String(hour).padStart(2, "0")}`),
    turnaroundLabel:
      report.approvalTurnaround.medianMinutes == null
        ? "No decisions yet"
        : formatDuration(report.approvalTurnaround.medianMinutes),
  };
}
