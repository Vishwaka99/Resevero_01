import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildMyReservationsView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { myReservationsQuery, parseQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/me/reservations?tab&type&window&cursor - rows, tab counts, paging. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(myReservationsQuery, request.nextUrl.searchParams);
    return buildMyReservationsView(user, query);
  });
}
