import { cookies } from "next/headers";

import { getDataStore } from "@/lib/data";
import type { Role, User } from "@/lib/domain/types";
import { forbidden, unauthenticated } from "@/lib/server/errors";
import { createClient } from "@/utils/supabase/server";

/**
 * Session handling, on Supabase Auth.
 *
 * Supabase owns the credential and the tokens; the cookies it sets are read
 * and refreshed through `@supabase/ssr`. What it does *not* own is the role:
 * that is read from this application's `users` table on every request, so
 * demoting or deactivating someone takes effect immediately instead of waiting
 * for their access token to expire.
 *
 * So a signed-in request resolves in two steps: Supabase says which identity
 * is calling, and the `users` table says what that identity may do.
 */

async function client() {
  return createClient(await cookies());
}

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
};

async function toAuthUser(user: User): Promise<AuthUser> {
  const departments = await getDataStore().catalog.departments();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: departments.find((d) => d.id === user.departmentId)?.name ?? null,
  };
}

/**
 * The profile a Supabase identity maps to.
 *
 * Normally that is a straight lookup on the link column. The email fallback
 * covers a profile created before the identity existed — an account invited by
 * an admin, or a database seeded ahead of its auth users. It is read-only:
 * writing the link is `signIn`'s job, so that rendering a page never writes.
 *
 * A profile already linked to a *different* identity is refused rather than
 * matched on email, so registering a second Supabase account with someone's
 * address cannot borrow their role.
 */
async function profileFor(authUserId: string, email: string | null | undefined): Promise<User | null> {
  const store = getDataStore();

  const linked = await store.users.findByAuthUserId(authUserId);
  if (linked) return linked;

  if (!email) return null;
  const byEmail = await store.users.findByEmail(email);
  if (!byEmail || byEmail.authUserId) return null;
  return byEmail;
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSession(): Promise<AuthUser | null> {
  // getUser() revalidates the access token with Supabase rather than trusting
  // the cookie, which is the point: a cookie is whatever the client sent.
  const { data, error } = await (await client()).auth.getUser();
  if (error || !data.user) return null;

  const profile = await profileFor(data.user.id, data.user.email);
  if (!profile || !profile.isActive) return null;
  return toAuthUser(profile);
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getSession();
  if (!user) throw unauthenticated();
  return user;
}

/**
 * The server-side half of the permission matrix. Hiding a button in the UI is
 * never the only check: every admin BFF route and action calls this.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw forbidden("That area is for admins.");
  return user;
}

export type SignInResult = { ok: true; user: AuthUser } | { ok: false; message: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const supabase = await client();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

  // One message whether the address is unknown or the password is wrong, so
  // the form can't be used to discover which accounts exist.
  if (error || !data.user) {
    return { ok: false, message: "That email and password don't match an account." };
  }

  const store = getDataStore();
  const linked = await store.users.findByAuthUserId(data.user.id);
  const profile = linked ?? (await store.users.findByEmail(data.user.email ?? email));

  // An identity with no profile holds no role, so it must not get in. The
  // Supabase session is discarded as well, or the cookie would survive the
  // refusal and the proxy would wave the next request through.
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, message: "That sign-in has no Reservo profile. Ask an admin to add you." };
  }
  if (profile.authUserId && profile.authUserId !== data.user.id) {
    await supabase.auth.signOut();
    return { ok: false, message: "That email belongs to another sign-in. Ask an admin to sort it out." };
  }
  if (!profile.isActive) {
    await supabase.auth.signOut();
    return { ok: false, message: "That account has been deactivated. Ask an admin to re-enable it." };
  }

  // First successful sign-in binds the profile to the identity, so later
  // requests resolve on the link column and a change of email cannot move it.
  const bound = profile.authUserId ? profile : await store.users.update(profile.id, { authUserId: data.user.id });
  return { ok: true, user: await toAuthUser(bound) };
}

export async function signOut(): Promise<void> {
  await (await client()).auth.signOut();
}
