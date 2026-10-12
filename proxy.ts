import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in this order.
 *
 * It refreshes the Supabase session. Access tokens are short-lived, and a
 * server component cannot write cookies, so something that *can* has to rotate
 * them — otherwise a user is signed out the moment their token expires. This is
 * that something.
 *
 * Then it keeps signed-out visitors off the app pages. That part is a
 * convenience, not the security: Next's own documentation warns that a matcher
 * change or a moved server function can silently remove proxy coverage, so
 * every BFF route and server action calls `requireUser()` / `requireAdmin()`
 * and does not trust having been behind this.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const toSignIn = () => {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/" && pathname !== "/dashboard") signIn.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Unconfigured means nobody can be signed in, so send them to /sign-in,
  // which is outside the matcher and will report the missing configuration
  // properly. Failing closed here beats 500ing every page.
  if (!url || !key) return toSignIn();

  // Rebuilt by setAll below, so refreshed cookies ride along on the response.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Calling getUser() is what triggers the refresh. Its result is only used to
  // decide the redirect; the role is settled later, against the users table.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return toSignIn();

  return response;
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
