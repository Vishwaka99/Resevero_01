import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildReportsView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { parseQuery, reportsQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/admin/reports?range - KPIs, utilisation, heatmap and outcomes. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const admin = await requireAdmin();
    const query = parseQuery(reportsQuery, request.nextUrl.searchParams);
    return buildReportsView(admin, query);
  });
}
