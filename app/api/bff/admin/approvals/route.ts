import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildApprovalsView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { approvalsQuery, parseQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/admin/approvals?selected - the queue and the selected request. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const admin = await requireAdmin();
    const query = parseQuery(approvalsQuery, request.nextUrl.searchParams);
    return buildApprovalsView(admin, query);
  });
}
