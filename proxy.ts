import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the Supabase session, then keeps signed-out visitors off the app pages. */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const toSignIn = () => {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/" && pathname !== "/dashboard") signIn.searchParams.set("next", `${pathname}${search}`);

    // A refresh that fails leaves the stale token in the browser, so every
    // later request repeats it and Supabase answers 400 again. Dropping the
    // auth cookies on the way out means the next request arrives cleanly
    // signed out. The names are matched on their shape rather than spelled
    // out, because a large session is chunked across `.0`, `.1`, and so on.
    const redirect = NextResponse.redirect(signIn);
    for (const { name } of request.cookies.getAll()) {
      if (name.startsWith("sb-") && name.includes("-auth-token")) {
        redirect.cookies.set({ name, value: "", path: "/", maxAge: 0 });
      }
    }
    return redirect;
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
