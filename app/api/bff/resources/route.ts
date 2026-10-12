import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildBrowseResourcesView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { parseQuery, resourcesQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/resources?date&from&to&type&minCapacity - cards for the browse grid. */
export function GET(request: NextRequest) {
  return bffRoute(async () => {
    const user = await requireUser();
    const query = parseQuery(resourcesQuery, request.nextUrl.searchParams);
    return buildBrowseResourcesView(user, query);
  });
}
