import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

/**
 * Where the link in Supabase's email lands.
 *
 * It accepts both shapes a Supabase link can arrive in, because which one you
 * get depends on a template in the dashboard rather than on anything in this
 * repository:
 *
 * - `?code=…`, when the template uses the stock `{{ .ConfirmationURL }}`. That
 *   points at Supabase's own verify endpoint, which redirects here with a PKCE
 *   code to exchange.
 * - `?token_hash=…&type=…`, when the template links straight here instead.
 *   That is the form Supabase recommends for server-rendered apps, and the one
 *   `supabase/templates/` uses: one less redirect, and the link cannot be
 *   invalidated by a scanner following it through their endpoint.
 *
 * Handling only the second would reject every link sent by an unedited
 * project, which is a miserable thing to debug from an inbox.
 *
 * Confirming proves the address; it does not grant access. A self-registered
 * profile stays inactive until an admin enables it, so the session created
 * here is discarded rather than leaving someone holding a valid token for an
 * account the app will refuse.
 *
 * This route sits outside the proxy's matcher deliberately: whoever follows
 * the link has no session yet, and bouncing them to sign-in before the token
 * is read would make the link useless.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const toSignIn = (notice: string) => {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("notice", notice);
    return NextResponse.redirect(url);
  };

  const supabase = createClient(await cookies());

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  let failed: boolean;
  if (code) {
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type) {
    failed = Boolean((await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error);
  } else {
    // Supabase also reports its own refusals this way, as ?error=… — an
    // expired link, usually. Nothing to verify either way.
    return toSignIn("link-invalid");
  }

  if (failed) return toSignIn("link-invalid");

  await supabase.auth.signOut();
  return toSignIn("confirmed");
}
