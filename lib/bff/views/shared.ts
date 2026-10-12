/**
 * Pieces every view model shares: the navigation, status mapping and the small
 * display shapes the components expect. Formatting lives here, never in a
 * component, so a time looks the same on every screen.
 */

import type { AuthUser } from "@/lib/auth/session";
import type { IconName } from "@/components/ui/Icon";
import type { BadgeStatus } from "@/components/ui/primitives";
import type { ReservationStatus, ReservationWithRelations, ResourceWithRelations } from "@/lib/domain/types";
import { formatDay, formatDuration, formatRange, formatRelative, formatWhen } from "@/lib/domain/time";

export type NavItem = { id: string; label: string; icon: IconName; href: string; count?: number };
export type NavSection = { title: string; items: NavItem[] };

/**
 * The sidebar, filtered by role. The Admin section simply is not in the view
 * model for a member — and every admin route checks the role again anyway.
 */
export function navSections(user: AuthUser, pendingApprovals = 0): NavSection[] {
  const sections: NavSection[] = [
    {
      title: "Overview",
      items: [
        { id: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard" },
        { id: "schedule", label: "Schedule", icon: "timeline", href: "/schedule" },
      ],
    },
    {
      title: "Reservations",
      items: [
        { id: "reservations", label: "My reservations", icon: "calendar-check", href: "/reservations" },
        { id: "resources", label: "Browse resources", icon: "box", href: "/resources" },
      ],
    },
  ];

  if (user.role === "admin") {
    sections.push({
      title: "Admin",
      items: [
        { id: "approvals", label: "Approvals", icon: "inbox", href: "/admin/approvals", count: pendingApprovals || undefined },
        { id: "manage-resources", label: "Manage resources", icon: "building", href: "/admin/resources" },
        { id: "users", label: "Users & roles", icon: "users", href: "/admin/users" },
        { id: "reports", label: "Reports", icon: "chart", href: "/admin/reports" },
      ],
    });
  }

  sections.push({
    title: "System",
    items: [{ id: "activity", label: "Activity log", icon: "shield", href: "/activity" }],
  });

  return sections;
}

/** The phone tab bar: the five things people do most. */
export function tabBarItems(user: AuthUser): NavItem[] {
  const items: NavItem[] = [
    { id: "dashboard", label: "Home", icon: "dashboard", href: "/dashboard" },
    { id: "schedule", label: "Schedule", icon: "timeline", href: "/schedule" },
    { id: "new", label: "Reserve", icon: "calendar-plus", href: "/reservations/new" },
    { id: "reservations", label: "Bookings", icon: "calendar-check", href: "/reservations" },
  ];
  items.push(
    user.role === "admin"
      ? { id: "approvals", label: "Approvals", icon: "inbox", href: "/admin/approvals" }
      : { id: "resources", label: "Resources", icon: "box", href: "/resources" },
  );
  return items;
}

/* --------------------------------------------------------------- status */

export const STATUS_TO_BADGE: Record<ReservationStatus, BadgeStatus> = {
  pending: "pending",
  confirmed: "confirmed",
  rejected: "rejected",
  cancelled: "cancelled",
  completed: "completed",
};

/** Resource types map to an icon from the Reservo set. */
export function resourceIcon(resource: ResourceWithRelations): IconName {
  const known: Record<string, IconName> = { building: "building", monitor: "monitor", car: "car" };
  return known[resource.type.icon] ?? "box";
}

/* ----------------------------------------------------------- shapes */

export type ReservationRow = {
  id: string;
  code: string;
  title: string;
  resourceName: string;
  resourceHref: string;
  locationName: string;
  resourceIcon: IconName;
  when: string;
  timeRange: string;
  day: string;
  repeatLabel: string | null;
  attendees: number;
  status: ReservationStatus;
  badge: BadgeStatus;
  badgeLabel: string;
  owner: string;
  isMine: boolean;
  duration: string;
  note: string | null;
  canCancel: boolean;
  canCheckIn: boolean;
  canEdit: boolean;
  checkedIn: boolean;
  startsAtISO: string;
  endsAtISO: string;
};

export const REPEAT_LABEL: Record<string, string> = {
  weekly: "Repeats weekly",
  weekdays: "Repeats every weekday",
};

/** The one place a reservation becomes a display row. */
export function toReservationRow(
  reservation: ReservationWithRelations,
  viewer: AuthUser,
  options: { now?: Date; canCheckIn?: boolean } = {},
): ReservationRow {
  const now = options.now ?? new Date();
  const isMine = reservation.userId === viewer.id;
  const isOpen = reservation.status === "confirmed" || reservation.status === "pending";
  const badgeLabel =
    reservation.status === "cancelled" && reservation.cancelReason?.startsWith("Released automatically")
      ? "Released"
      : reservation.status === "pending"
        ? "Pending approval"
        : reservation.status.charAt(0).toUpperCase() + reservation.status.slice(1);

  return {
    id: reservation.id,
    code: reservation.code,
    title: reservation.title,
    resourceName: reservation.resource.name,
    resourceHref: `/resources/${reservation.resource.id}`,
    locationName: reservation.resource.location.name,
    resourceIcon: resourceIcon(reservation.resource),
    when: formatWhen(reservation.startsAt, reservation.endsAt),
    timeRange: formatRange(reservation.startsAt, reservation.endsAt),
    day: formatDay(reservation.startsAt),
    repeatLabel: reservation.series ? REPEAT_LABEL[reservation.series.rule] ?? "Repeats" : null,
    attendees: reservation.attendees,
    status: reservation.status,
    badge: STATUS_TO_BADGE[reservation.status],
    badgeLabel,
    owner: isMine ? "You" : reservation.user.name,
    isMine,
    duration: formatDuration(Math.round((reservation.endsAt.getTime() - reservation.startsAt.getTime()) / 60000)),
    note: reservation.decisionNote ?? reservation.cancelReason ?? null,
    canCancel: isOpen && reservation.endsAt > now && (isMine || viewer.role === "admin"),
    canCheckIn: Boolean(options.canCheckIn) && isMine,
    canEdit: isOpen && reservation.startsAt > now && (isMine || viewer.role === "admin"),
    checkedIn: Boolean(reservation.checkedInAt),
    startsAtISO: reservation.startsAt.toISOString(),
    endsAtISO: reservation.endsAt.toISOString(),
  };
}

export { formatDay, formatDuration, formatRange, formatRelative, formatWhen };
