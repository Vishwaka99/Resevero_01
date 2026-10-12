import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildDashboardView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";

export const dynamic = "force-dynamic";

/** GET /api/bff/dashboard - upNext, gauges, timeline, freeNow, approvals, notices. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const user = await requireUser();
    return buildDashboardView(user, { type: request.nextUrl.searchParams.get("type") ?? undefined });
  });
}
