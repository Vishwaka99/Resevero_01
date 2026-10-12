/**
 * My reservations — everything the signed-in person has booked, in four tabs.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import { checkInWindow } from "@/lib/server/availability";
import { settleOverdue } from "@/lib/server/reservations";
import { navSections, tabBarItems, toReservationRow, type NavItem, type NavSection, type ReservationRow } from "./shared";

export type MyReservationsTab = "upcoming" | "pending" | "past" | "cancelled";

export type MyReservationsView = {
  user: AuthUser;
  nav: NavSection[];
  tabBar: NavItem[];
  rows: ReservationRow[];
  tabs: Array<{ id: MyReservationsTab; label: string; count: number; href: string }>;
  activeTab: MyReservationsTab;
  typeOptions: Array<{ id: string; label: string }>;
  activeType: string;
  windowOptions: Array<{ id: string; label: string }>;
  activeWindow: string;
  page: { shown: number; total: number; previousHref: string | null; nextHref: string | null };
  emptyTitle: string;
  emptyText: string;
};

const PAGE_SIZE = 8;

const EMPTY_COPY: Record<MyReservationsTab, { title: string; text: string }> = {
  upcoming: { title: "Nothing booked yet", text: "Rooms, equipment and vehicles you reserve will show up here." },
  pending: { title: "No requests waiting", text: "Requests for resources that need sign-off will appear here while an admin decides." },
  past: { title: "No past reservations", text: "Reservations you've finished with will be listed here." },
  cancelled: { title: "Nothing cancelled", text: "Reservations you cancel, or that were released, will be listed here." },
};

export async function buildMyReservationsView(
  user: AuthUser,
  query: { tab?: MyReservationsTab; type?: string; window?: string; cursor?: number },
  now: Date = new Date(),
): Promise<MyReservationsView> {
  const store = getDataStore();
  await settleOverdue(now);

  const activeTab: MyReservationsTab = query.tab ?? "upcoming";
  const activeWindow = query.window ?? "30d";
  const activeType = query.type ?? "all";
  const cursor = query.cursor ?? 0;

  const [types, mine, pendingAdmin] = await Promise.all([
    store.catalog.resourceTypes(),
    store.reservations.list({ userId: user.id }),
    user.role === "admin" ? store.reservations.list({ statuses: ["pending"], from: now }) : Promise.resolve([]),
  ]);

  const windowCutoff =
    activeWindow === "all" ? null : new Date(now.getTime() + (activeWindow === "90d" ? 90 : 30) * 24 * 60 * 60 * 1000);

  const inTab = (tab: MyReservationsTab) =>
    mine.filter((reservation) => {
      if (activeType !== "all" && reservation.resource.typeId !== activeType) return false;
      switch (tab) {
        case "upcoming":
          return reservation.status === "confirmed" && reservation.endsAt > now && (!windowCutoff || reservation.startsAt <= windowCutoff);
        case "pending":
          return reservation.status === "pending" && reservation.endsAt > now;
        case "past":
          return reservation.status === "completed" || (reservation.status === "confirmed" && reservation.endsAt <= now);
        case "cancelled":
          return reservation.status === "cancelled" || reservation.status === "rejected";
      }
    });

  const matching = inTab(activeTab).sort((a, b) =>
    activeTab === "past" || activeTab === "cancelled"
      ? b.startsAt.getTime() - a.startsAt.getTime()
      : a.startsAt.getTime() - b.startsAt.getTime(),
  );

  const page = matching.slice(cursor, cursor + PAGE_SIZE);

  const href = (overrides: Partial<{ tab: string; type: string; window: string; cursor: number }>) => {
    const params = new URLSearchParams();
    const tab = overrides.tab ?? activeTab;
    const type = overrides.type ?? activeType;
    const windowValue = overrides.window ?? activeWindow;
    const nextCursor = overrides.cursor ?? 0;
    if (tab !== "upcoming") params.set("tab", tab);
    if (type !== "all") params.set("type", type);
    if (windowValue !== "30d") params.set("window", windowValue);
    if (nextCursor) params.set("cursor", String(nextCursor));
    const search = params.toString();
    return search ? `/reservations?${search}` : "/reservations";
  };

  return {
    user,
    nav: navSections(user, pendingAdmin.length),
    tabBar: tabBarItems(user),
    rows: page.map((reservation) =>
      toReservationRow(reservation, user, {
        now,
        canCheckIn: reservation.resource.requiresCheckIn && checkInWindow(reservation, now).isOpen && reservation.status === "confirmed",
      }),
    ),
    tabs: (["upcoming", "pending", "past", "cancelled"] as const).map((tab) => ({
      id: tab,
      label: tab === "upcoming" ? "Upcoming" : tab === "pending" ? "Pending" : tab === "past" ? "Past" : "Cancelled",
      count: inTab(tab).length,
      href: href({ tab }),
    })),
    activeTab,
    typeOptions: [{ id: "all", label: "All types" }, ...types.map((type) => ({ id: type.id, label: type.name }))],
    activeType,
    windowOptions: [
      { id: "30d", label: "Next 30 days" },
      { id: "90d", label: "Next 90 days" },
      { id: "all", label: "Any time" },
    ],
    activeWindow,
    page: {
      shown: page.length,
      total: matching.length,
      previousHref: cursor > 0 ? href({ cursor: Math.max(0, cursor - PAGE_SIZE) }) : null,
      nextHref: cursor + PAGE_SIZE < matching.length ? href({ cursor: cursor + PAGE_SIZE }) : null,
    },
    emptyTitle: EMPTY_COPY[activeTab].title,
    emptyText: EMPTY_COPY[activeTab].text,
  };
}
