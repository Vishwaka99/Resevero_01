import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildManageResourcesView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { manageResourcesQuery, parseQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/admin/resources?edit - the catalogue table and the edit form. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const admin = await requireAdmin();
    const query = parseQuery(manageResourcesQuery, request.nextUrl.searchParams);
    return buildManageResourcesView(admin, query);
  });
}
