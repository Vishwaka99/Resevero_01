import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

/** The admin area's gate. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/sign-in");
  if (user.role !== "admin") redirect("/no-access");

  return <>{children}</>;
}
