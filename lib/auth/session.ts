import { cookies, headers } from "next/headers";

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
  // Covers both a registration nobody has approved yet and an account that has
  // been switched off, without saying which — and without claiming a brand new
  // account "has been deactivated".
  if (!profile.isActive) {
    await supabase.auth.signOut();
    return { ok: false, message: "That account isn't active. An admin has to enable it before you can sign in." };
  }

  // First successful sign-in binds the profile to the identity, so later
  // requests resolve on the link column and a change of email cannot move it.
  const bound = profile.authUserId ? profile : await store.users.update(profile.id, { authUserId: data.user.id });
  return { ok: true, user: await toAuthUser(bound) };
}

export type SignUpResult = { ok: true } | { ok: false; message: string };

/**
 * Where Supabase should send the confirmation link back to. It has to be on the
 * project's redirect allow-list, or Supabase falls back to the configured Site
 * URL and the link lands on the wrong host.
 */
async function confirmUrl(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}/auth/confirm`;
}

/**
 * Self-registration.
 *
 * Creates the Supabase identity and a profile that is **not active**: an admin
 * enables it on the Users screen. So registering proves an address and queues a
 * request; it does not grant access, and nobody can book a room by signing
 * themselves up.
 *
 * Every outcome that is not a usable error reads as success. An address that
 * already has a profile is left untouched, and Supabase's own "already
 * registered" is folded in too, because a form that distinguishes the two is a
 * way of asking which addresses have accounts.
 */
export async function signUp(input: { name: string; email: string; password: string }): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const store = getDataStore();

  if (await store.users.findByEmail(email)) return { ok: true };

  const supabase = await client();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { emailRedirectTo: await confirmUrl() },
  });

  if (error) {
    if (error.code === "user_already_exists" || /already (registered|exists)/i.test(error.message)) {
      return { ok: true };
    }
    // Worth passing through: a rejected password says what is wrong with it.
    return { ok: false, message: error.message };
  }
  if (!data.user) return { ok: false, message: "Could not create that account. Try again." };

  // When confirmations are on, Supabase will not admit that an address is
  // taken: it answers with a decoy user — a random id and an empty
  // `identities` array — and sends no email. Taking that id at face value
  // would bind a profile to an identity that does not exist, and the real
  // owner could never sign in again, so stop here instead.
  if (data.user.identities?.length === 0) return { ok: true };

  // A project with email confirmation switched off hands back a live session.
  // The account is not approved, so that session is thrown away rather than
  // leaving someone half signed in.
  if (data.session) await supabase.auth.signOut();

  // If this throws, the identity exists with no profile. Sign-in refuses that
  // combination by name, and an admin can invite the address properly.
  await store.users.create({
    name: input.name.trim(),
    email,
    authUserId: data.user.id,
    role: "member",
    departmentId: null,
    isActive: false,
  });

  return { ok: true };
}

export async function signOut(): Promise<void> {
  await (await client()).auth.signOut();
}
