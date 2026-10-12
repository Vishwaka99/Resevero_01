import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildScheduleView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { parseQuery, scheduleQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/schedule?date&type&location&view - timeline rows and filters. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(scheduleQuery, request.nextUrl.searchParams);
    return buildScheduleView(user, {
      ...query,
      selected: request.nextUrl.searchParams.get("selected") ?? undefined,
    });
  });
}
