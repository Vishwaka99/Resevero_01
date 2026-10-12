import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/session";
import { buildReport, utilisationCsv } from "@/lib/server/reports";
import { isDomainError, statusForCode } from "@/lib/server/errors";
import { parseQuery, reportsQuery } from "@/lib/bff/schemas";
import { localToday } from "@/lib/domain/time";

export const dynamic = "force-dynamic";

/** GET /api/bff/admin/reports/export?range - the utilisation table as CSV. */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { range } = parseQuery(reportsQuery, request.nextUrl.searchParams);
    const report = await buildReport(range);
    const filename = "reservo-utilisation-" + range + "-" + localToday() + ".csv";

    return new NextResponse(utilisationCsv(report), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="' + filename + '"',
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isDomainError(error)) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForCode(error.code) });
    }
    throw error;
  }
}
