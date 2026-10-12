import { requireAdmin } from "@/lib/auth/session";
import { buildUsersView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";

export const dynamic = "force-dynamic";

/** GET /api/bff/admin/users - users, their usage and the permission matrix. */
export function GET() {
  return bffRoute(async () => {
    const admin = await requireAdmin();
    return buildUsersView(admin);
  });
}
