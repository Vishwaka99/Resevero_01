import { cookies } from "next/headers";
import { cache } from "react";

import { getDataStore } from "@/lib/data";
import type { Role, User } from "@/lib/domain/types";
import { forbidden, unauthenticated } from "@/lib/server/errors";
import { createAdminClient, findIdentityByEmail } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

/** Session handling, on Supabase Auth. */

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

/** The profile a Supabase identity maps to. */
async function profileFor(authUserId: string, email: string | null | undefined): Promise<User | null> {
  const store = getDataStore();

  const linked = await store.users.findByAuthUserId(authUserId);
  if (linked) return linked;

  if (!email) return null;
  const byEmail = await store.users.findByEmail(email);
  if (!byEmail || byEmail.authUserId) return null;
  return byEmail;
}

/**
 * A token the auth server no longer holds fails every time it is presented, so
 * it has to be thrown away rather than retried. The proxy does that for the
 * routes it matches; the pair below covers the rest, which is the BFF.
 */
function tokenIsSpent(error: { status?: number } | null): boolean {
  // No error and no claims means the cookie did not even parse, so there is
  // nothing in it worth keeping. A 4xx is the auth server refusing it. Anything
  // else is transport, and the token may well be fine — signing someone out
  // over a blip is the worse failure.
  if (!error) return true;
  return typeof error.status === "number" && error.status >= 400 && error.status < 500;
}

/** Drops the auth cookies where that is possible: a route handler can write them, a server component cannot, and those requests are the proxy's. */
async function discardStaleAuth(): Promise<void> {
  try {
    const store = await cookies();
    for (const { name } of store.getAll()) {
      if (name.startsWith("sb-") && name.includes("-auth-token")) store.delete(name);
    }
  } catch {
    // Read-only cookies, in a server component.
  }
}

/** Resolves the signed-in user once per request, verifying the token locally rather than asking Supabase. */
const resolveSession = cache(async (): Promise<AuthUser | null> => {
  const { data, error } = await (await client()).auth.getClaims();
  if (error || !data?.claims) {
    if (tokenIsSpent(error)) await discardStaleAuth();
    return null;
  }

  const profile = await profileFor(data.claims.sub, data.claims.email);
  if (!profile || !profile.isActive) return null;
  return toAuthUser(profile);
});

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSession(): Promise<AuthUser | null> {
  return resolveSession();
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

export type SignUpResult = { ok: true } | { ok: false; message: string; field?: "email" | "password" };

/** Registration. */
export async function signUp(input: { name: string; email: string; password: string }): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const store = getDataStore();

  if (await store.users.findByEmail(email)) {
    return { ok: false, message: "That email already has an account. Sign in instead.", field: "email" };
  }

  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    // No confirmation step, so the address is taken on trust and the account
    // works immediately.
    email_confirm: true,
  });

  let authUserId: string;
  let identityIsOurs = true;

  if (created.error) {
    if (!/already (registered|exists)/i.test(created.error.message)) {
      return { ok: false, message: created.error.message };
    }

    // The identity exists but no profile points at it — the in-memory store
    // was restarted, or a profile was deleted. Signing in with the password
    // just typed is what proves this is the owner rather than someone
    // claiming the address, so adopt it only if that succeeds.
    const adopted = await findIdentityByEmail(admin, email);
    const proof = adopted
      ? await (await client()).auth.signInWithPassword({ email, password: input.password })
      : null;

    if (!adopted || !proof || proof.error || !proof.data.user) {
      return { ok: false, message: "That email already has an account. Sign in instead.", field: "email" };
    }

    authUserId = adopted;
    identityIsOurs = false;
  } else if (!created.data.user) {
    return { ok: false, message: "Could not create that account. Try again." };
  } else {
    authUserId = created.data.user.id;
  }

  try {
    await store.users.create({
      name: input.name.trim(),
      email,
      authUserId,
      role: "member",
      departmentId: null,
      isActive: true,
    });
  } catch (error) {
    // Only an identity this call made may be removed; one that was adopted
    // belonged to someone beforehand.
    if (identityIsOurs) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    throw error;
  }

  // Sign in with the credentials just chosen, so registering lands in the app
  // rather than on a form asking for the password typed a second ago. An
  // adopted identity is already signed in from the proof above.
  if (identityIsOurs) {
    const supabase = await client();
    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });
    if (error) {
      // The account is real and the password is right, so this is a transport
      // problem rather than a wrong answer. Sending them to sign in is a
      // better outcome than discarding a working account.
      return { ok: false, message: "Account created, but signing you in failed. Try signing in." };
    }
  }

  return { ok: true };
}

export async function signOut(): Promise<void> {
  await (await client()).auth.signOut();
}
