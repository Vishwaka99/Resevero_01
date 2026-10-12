/**
 * UserService — invites, role changes and deactivation. Two roles keep it
 * simple: a member books, an admin also manages and approves.
 */

import { getDataStore } from "@/lib/data";
import type { AuthUser } from "@/lib/auth/session";
import type { Role, User } from "@/lib/domain/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { notFound, ruleViolation } from "./errors";

export type UserRow = {
  user: User;
  departmentName: string | null;
  bookingsLast30Days: number;
};

export async function listUsers(now: Date = new Date()): Promise<UserRow[]> {
  const store = getDataStore();
  const [users, departments, recent] = await Promise.all([
    store.users.list(),
    store.catalog.departments(),
    store.reservations.list({ from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: now }),
  ]);

  return users.map((user) => ({
    user,
    departmentName: departments.find((d) => d.id === user.departmentId)?.name ?? null,
    bookingsLast30Days: recent.filter((r) => r.userId === user.id && r.status !== "cancelled" && r.status !== "rejected").length,
  }));
}

export type InviteInput = {
  name: string;
  email: string;
  role: Role;
  departmentId: string | null;
  /**
   * Temporary password, set on the new Supabase identity. In production this
   * becomes `inviteUserByEmail` and the invitee chooses their own.
   */
  temporaryPassword: string;
};

export async function inviteUser(actor: AuthUser, input: InviteInput): Promise<User> {
  const store = getDataStore();
  const email = input.email.trim().toLowerCase();

  if (await store.users.findByEmail(email)) {
    throw ruleViolation("Someone with that email is already on the system.");
  }
  if (input.temporaryPassword.length < 8) {
    throw ruleViolation("The temporary password needs at least 8 characters.");
  }

  // The identity comes first. If the profile insert then fails we are left
  // with an unused Supabase account, which is recoverable; the other order
  // leaves a profile that can never sign in, which looks like a working user.
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password: input.temporaryPassword,
    // Nobody is going to click a confirmation link for a colleague, and an
    // unconfirmed identity cannot sign in with a password.
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    throw ruleViolation(created.error?.message ?? "Could not create that sign-in.");
  }
  const authUserId = created.data.user.id;

  try {
    return await store.runInTransaction(async () => {
      const user = await store.users.create({
        name: input.name.trim(),
        email,
        authUserId,
        role: input.role,
        departmentId: input.departmentId,
        isActive: true,
      });

      await store.audit.create({
        actorId: actor.id,
        entity: "user",
        entityId: user.id,
        action: "user.invite",
        diff: { email: user.email, role: user.role },
      });

      return user;
    });
  } catch (error) {
    // Roll the identity back, so a retry is not blocked by "already
    // registered" for an account that has no profile.
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
    throw error;
  }
}

export async function setRole(actor: AuthUser, userId: string, role: Role): Promise<User> {
  const store = getDataStore();
  const user = await store.users.findById(userId);
  if (!user) throw notFound("That user");

  if (user.id === actor.id && role !== "admin") {
    throw ruleViolation("You can't remove your own admin role. Ask another admin to do it.");
  }
  if (user.role === "admin" && role === "member") {
    const admins = (await store.users.list()).filter((u) => u.role === "admin" && u.isActive);
    if (admins.length <= 1) throw ruleViolation("There has to be at least one active admin.");
  }

  return store.runInTransaction(async () => {
    const updated = await store.users.update(userId, { role });
    await store.audit.create({
      actorId: actor.id,
      entity: "user",
      entityId: userId,
      action: "user.set_role",
      diff: { from: user.role, to: role },
    });
    return updated;
  });
}

export async function setActive(actor: AuthUser, userId: string, isActive: boolean): Promise<User> {
  const store = getDataStore();
  const user = await store.users.findById(userId);
  if (!user) throw notFound("That user");
  if (user.id === actor.id && !isActive) throw ruleViolation("You can't deactivate your own account.");

  if (!isActive && user.role === "admin") {
    const admins = (await store.users.list()).filter((u) => u.role === "admin" && u.isActive);
    if (admins.length <= 1) throw ruleViolation("There has to be at least one active admin.");
  }

  return store.runInTransaction(async () => {
    const updated = await store.users.update(userId, { isActive });
    await store.audit.create({
      actorId: actor.id,
      entity: "user",
      entityId: userId,
      action: isActive ? "user.activate" : "user.deactivate",
      diff: { isActive },
    });
    return updated;
  });
}

/**
 * What each role may do. The screen renders this, and the BFF enforces the same
 * rules on every request — the matrix is documentation, not the gate.
 */
export const PERMISSION_MATRIX = [
  { module: "Resources", note: "browse and see availability", member: { view: true, create: false, manage: false }, admin: { view: true, create: true, manage: true } },
  { module: "Reservations", note: "own bookings", member: { view: true, create: true, manage: true }, admin: { view: true, create: true, manage: true } },
  { module: "Other people's reservations", note: "read-only on the shared schedule", member: { view: true, create: false, manage: false }, admin: { view: true, create: true, manage: true } },
  { module: "Approvals", note: "decide requests", member: { view: false, create: false, manage: false }, admin: { view: true, create: false, manage: true } },
  { module: "Maintenance blocks", note: "close a resource", member: { view: true, create: false, manage: false }, admin: { view: true, create: true, manage: true } },
  { module: "Users & roles", note: "invite and promote", member: { view: false, create: false, manage: false }, admin: { view: true, create: true, manage: true } },
  { module: "Reports", note: "usage and turnaround", member: { view: false, create: false, manage: false }, admin: { view: true, create: false, manage: false } },
] as const;
