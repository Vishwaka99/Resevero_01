import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getDataStore } from "@/lib/data";
import type { Role, User } from "@/lib/domain/types";
import { forbidden, unauthenticated } from "@/lib/server/errors";
import { SESSION_COOKIE } from "./cookie";
import { verifyPassword } from "./password";

/**
 * Session handling: a signed, HTTP-only cookie holding the user id and an
 * expiry. It is deliberately small — the role is read from the database on
 * every request, so changing someone's role takes effect immediately instead of
 * living in a stale token.
 */

const SESSION_DAYS = 7;

function secret(): string {
  return process.env.SESSION_SECRET ?? "reservo-dev-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialise(userId: string, expiresAt: number): string {
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function parse(token: string): { userId: string; expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresRaw, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expiresRaw}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return { userId, expiresAt };
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

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSession(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const parsed = parse(token);
  if (!parsed) return null;

  const user = await getDataStore().users.findById(parsed.userId);
  if (!user || !user.isActive) return null;
  return toAuthUser(user);
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
  const user = await getDataStore().users.findByEmail(email);

  // One message for both cases, so the form can't be used to discover accounts.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, message: "That email and password don't match an account." };
  }
  if (!user.isActive) {
    return { ok: false, message: "That account has been deactivated. Ask an admin to re-enable it." };
  }

  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: serialise(user.id, expiresAt),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return { ok: true, user: await toAuthUser(user) };
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
