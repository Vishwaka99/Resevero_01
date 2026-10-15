import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildAvailabilityAnswer } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { availabilityQuery, parseQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/availability?resourceId&date&from&to&attendees The booking form calls this while the user types, so a clash is shown with alternatives before anything is submitted. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    await requireUser();
    const query = parseQuery(availabilityQuery, request.nextUrl.searchParams);
    return buildAvailabilityAnswer(query);
  });
}
