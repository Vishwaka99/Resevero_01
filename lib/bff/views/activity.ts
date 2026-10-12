/**
 * Activity log — the audit trail, so "who changed what" is answerable.
 * A member sees the entries they caused; an admin sees everything.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { IconName } from "@/components/ui/Icon";
import { formatRelative } from "@/lib/domain/time";
import { navSections, tabBarItems, type NavItem, type NavSection } from "./shared";

const ACTION_COPY: Record<string, { label: string; icon: IconName }> = {
  "reservation.create": { label: "booked", icon: "calendar-plus" },
  "reservation.reschedule": { label: "moved", icon: "clock" },
  "reservation.cancel": { label: "cancelled", icon: "x" },
  "reservation.cancel_for_maintenance": { label: "cancelled for maintenance", icon: "wrench" },
  "reservation.check_in": { label: "checked in to", icon: "check" },
  "reservation.approve": { label: "approved", icon: "check" },
  "reservation.reject": { label: "rejected", icon: "x" },
  "reservation.auto_reject": { label: "auto-rejected", icon: "x" },
  "reservation.auto_release": { label: "released", icon: "repeat" },
  "reservation.expire": { label: "expired", icon: "clock" },
  "resource.create": { label: "added resource", icon: "plus" },
  "resource.update": { label: "changed resource", icon: "settings" },
  "resource.retire": { label: "retired resource", icon: "tag" },
  "blackout.create": { label: "blocked time on", icon: "wrench" },
  "user.invite": { label: "invited", icon: "users" },
  "user.set_role": { label: "changed the role of", icon: "shield" },
  "user.activate": { label: "reactivated", icon: "users" },
  "user.deactivate": { label: "deactivated", icon: "users" },
};

export type ActivityEntry = {
  id: string;
  actorName: string;
  actionLabel: string;
  subject: string;
  icon: IconName;
  when: string;
  detail: string | null;
};

export type ActivityView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  entries: ActivityEntry[];
  scopeLabel: string;
};

export async function buildActivityView(user: AuthUser, now: Date = new Date()): Promise<ActivityView> {
  const store = getDataStore();
  const [log, users, resources, pending] = await Promise.all([
    store.audit.list(80),
    store.users.list(),
    store.resources.list(),
    user.role === "admin" ? store.reservations.list({ statuses: ["pending"], from: now }) : Promise.resolve([]),
  ]);

  const visible = user.role === "admin" ? log : log.filter((entry) => entry.actorId === user.id);
  const userById = new Map(users.map((u) => [u.id, u.name]));
  const resourceById = new Map(resources.map((r) => [r.id, r.name]));

  const entries: ActivityEntry[] = [];
  for (const entry of visible) {
    const copy = ACTION_COPY[entry.action] ?? { label: entry.action, icon: "info" as IconName };
    let subject = entry.entityId;

    if (entry.entity === "reservation") {
      const reservation = await store.reservations.findById(entry.entityId);
      subject = reservation ? `${reservation.code} · ${reservation.resource.name}` : "a reservation";
    } else if (entry.entity === "resource") {
      subject = resourceById.get(entry.entityId) ?? "a resource";
    } else if (entry.entity === "user") {
      subject = userById.get(entry.entityId) ?? "a user";
    } else if (entry.entity === "blackout") {
      const resourceId = typeof entry.diff.resourceId === "string" ? entry.diff.resourceId : null;
      subject = (resourceId ? resourceById.get(resourceId) : null) ?? "a resource";
    }

    entries.push({
      id: entry.id,
      actorName: entry.actorId ? (userById.get(entry.actorId) ?? "Someone") : "Reservo",
      actionLabel: copy.label,
      icon: copy.icon,
      subject,
      when: formatRelative(entry.createdAt, now),
      detail: describeDiff(entry.diff),
    });
  }

  return {
    user,
    nav: navSections(user, pending.length),
    tabBar: tabBarItems(user),
    entries,
    scopeLabel: user.role === "admin" ? "Every change on the system, newest first." : "Changes you made, newest first.",
  };
}

function describeDiff(diff: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof diff.reason === "string") parts.push(diff.reason);
  if (typeof diff.note === "string") parts.push(diff.note);
  if (typeof diff.becauseOf === "string") parts.push(`because ${diff.becauseOf} was approved`);
  if (typeof diff.from === "string" && typeof diff.to === "string") parts.push(`${diff.from} → ${diff.to}`);
  if (typeof diff.repeated === "number" && diff.repeated > 1) parts.push(`${diff.repeated} occurrences`);
  if (typeof diff.cancelled === "number" && diff.cancelled > 0) parts.push(`${diff.cancelled} reservations cancelled`);
  return parts.length ? parts.join(" · ") : null;
}
