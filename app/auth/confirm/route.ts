import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/utils/supabase/server";

/**
 * Where the confirmation link in Supabase's email lands.
 *
 * Confirming proves the address. It does not grant access: a self-registered
 * profile is inactive until an admin enables it, so the session that
 * `verifyOtp` creates is discarded and the visitor is sent to sign-in with a
 * note. Leaving that session would put someone in the odd position of holding
 * a valid Supabase token for an account the app will not let them use.
 *
 * This route is outside the proxy's matcher on purpose — a visitor following
 * the link has no session yet, and being redirected to sign-in before the
 * token is read would make the link useless.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const toSignIn = (notice: string) => {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("notice", notice);
    return NextResponse.redirect(url);
  };

  if (!tokenHash || !type) return toSignIn("link-invalid");

  const supabase = createClient(await cookies());
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return toSignIn("link-invalid");

  await supabase.auth.signOut();
  return toSignIn("confirmed");
}
