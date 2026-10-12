import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isDomainError, statusForCode } from "@/lib/server/errors";
import { fieldErrors } from "./schemas";

/**
 * One wrapper for every BFF route handler: it runs the builder, turns domain
 * failures and validation errors into the right status code, and keeps the
 * response shape identical across endpoints.
 */
export async function bffRoute<T>(build: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await build();
    if (data === null) {
      return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
    }
    return NextResponse.json({ data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: { code: "invalid", message: "Check the request parameters.", fields: fieldErrors(error) } },
        { status: 422 },
      );
    }
    if (isDomainError(error)) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: statusForCode(error.code) });
    }
    console.error("[bff] unhandled error", error);
    return NextResponse.json({ error: { code: "server_error", message: "Something went wrong." } }, { status: 500 });
  }
}
