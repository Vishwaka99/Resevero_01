import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

/**
 * The admin area's gate. Every admin page and BFF route checks the role again
 * on its own — this exists so a member who follows a stale link gets an
 * explanation instead of an error page.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/no-access");

  return <>{children}</>;
}
