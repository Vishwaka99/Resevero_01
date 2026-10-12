import type { AuthUser } from "@/lib/auth/session";
import { getDataStore } from "@/lib/data";
import { resetMemoryStore } from "@/lib/data/memory";
import { fromLocal, localToday, localWeekday, startOfLocalDay, addDaysISO } from "@/lib/domain/time";

/** A Monday well inside the seeded window, so rooms are open and nothing clashes. */
export function nextMonday(from: Date = new Date()): string {
  let dayISO = localToday(from);
  for (let guard = 0; guard < 14; guard += 1) {
    dayISO = addDaysISO(dayISO, 1);
    if (localWeekday(startOfLocalDay(dayISO)) === 1) return dayISO;
  }
  throw new Error("No Monday found");
}

/** `09:30` on a given local day, as an instant. */
export function at(dayISO: string, hhmm: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  return fromLocal(dayISO, hour * 60 + minute);
}

export async function freshStore() {
  resetMemoryStore();
  return getDataStore();
}

export async function asUser(email: string): Promise<AuthUser> {
  const store = getDataStore();
  const user = await store.users.findByEmail(email);
  if (!user) throw new Error(`No seeded user ${email}`);

  const departments = await store.catalog.departments();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: departments.find((d) => d.id === user.departmentId)?.name ?? null,
  };
}

export const ADMIN_EMAIL = "admin@reservo.test";
export const MEMBER_EMAIL = "member@reservo.test";

/** Board Room A: no approval, 30-minute slots, 4 h max, Mon-Fri 08:00-18:00. */
export const BOARD_ROOM_A = "res-board-a";
/** Toyota Van: needs an admin's approval. */
export const VAN = "res-van";
