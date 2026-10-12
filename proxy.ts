import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/cookie";

/**
 * A cheap first gate: no session cookie, no app pages. It only looks for the
 * cookie's presence — the signature, the expiry and the role are verified on
 * the server by `requireUser()` / `requireAdmin()`, which every BFF route and
 * server action calls. The proxy is the convenience, not the security.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession) {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/" && pathname !== "/dashboard") signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/schedule/:path*",
    "/resources/:path*",
    "/reservations/:path*",
    "/admin/:path*",
    "/activity/:path*",
    "/no-access",
  ],
};
