import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { getSession } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { navSections, tabBarItems } from "@/lib/bff/views/shared";

/** Everything behind sign-in shares this shell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/sign-in");

  const store = getDataStore();
  const [pending, unreadCount] = await Promise.all([
    user.role === "admin" ? store.reservations.list({ statuses: ["pending"], from: new Date() }) : Promise.resolve([]),
    store.notifications.countUnread(user.id),
  ]);

  return (
    <AppShell
      nav={navSections(user, pending.length)}
      tabBar={tabBarItems(user)}
      user={{ name: user.name, role: user.role, departmentName: user.departmentName }}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
