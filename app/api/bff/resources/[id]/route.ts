import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { buildResourceDetailView } from "@/lib/bff/views";
import { bffRoute } from "@/lib/bff/respond";
import { parseQuery, resourceDetailQuery } from "@/lib/bff/schemas";

export const dynamic = "force-dynamic";

/** GET /api/bff/resources/:id?week - specs, rules, usage and the week's lanes. */
export function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return bffRoute(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const query = parseQuery(resourceDetailQuery, request.nextUrl.searchParams);
    return buildResourceDetailView(user, id, query);
  });
}
