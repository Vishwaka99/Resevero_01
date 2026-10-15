import { NextResponse } from "next/server";

import { resetMemoryStore } from "@/lib/data/memory";

export const dynamic = "force-dynamic";

/** Development only: drops the in-memory data and reseeds it, so a demo can be run again from a clean start. */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: { code: "forbidden", message: "Not available in production." } }, { status: 403 });
  }

  resetMemoryStore();
  return NextResponse.json({ data: { reset: true } }, { headers: { "cache-control": "no-store" } });
}
