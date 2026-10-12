"use server";

/**
 * The BFF's write side.
 *
 * Every action does the same four things, in the same order:
 *   1. identify the caller and check the role,
 *   2. validate the input with Zod,
 *   3. call a domain service, which writes in a transaction with an audit row,
 *   4. revalidate the screens the write affects.
 *
 * Hiding a button is never the only check — an action called directly is
 * refused exactly like one called from the UI.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin, requireUser, signIn, signOut, signUp } from "@/lib/auth/session";
import { approveReservation, rejectReservation } from "@/lib/server/approvals";
import type { AvailabilityCheck } from "@/lib/server/availability";
import { isDomainError } from "@/lib/server/errors";
import { cancelReservation, checkIn, createReservation, rescheduleReservation } from "@/lib/server/reservations";
import { blockTime, createResource, retireResource, updateResource, type ResourceInput } from "@/lib/server/resources";
import { inviteUser, setActive, setRole } from "@/lib/server/users";
import { formatRange, formatTime, fromLocal } from "@/lib/domain/time";
import { errorState, successState, type ActionState, type ConflictInfo } from "./action-state";
import {
  blockTimeInput,
  createReservationInput,
  decisionInput,
  editReservationInput,
  inviteUserInput,
  parseForm,
  rejectInput,
  reservationIdInput,
  resourceInput,
  reservationIdInput as cancelInput,
  setActiveInput,
  setRoleInput,
  signInInput,
  signUpInput,
  toMinutes,
} from "./schemas";

/* ------------------------------------------------------------ helpers */

/** Turns a thrown domain failure into a message, and lets real bugs through. */
function toState(error: unknown): ActionState {
  if (isDomainError(error)) return errorState(error.message);
  throw error;
}

function conflictFrom(check: AvailabilityCheck): ConflictInfo {
  return {
    message: check.message ?? "That time isn't available.",
    suggestions: check.suggestions.map((suggestion) => ({
      label: suggestion.label || formatRange(suggestion.startsAt, suggestion.endsAt),
      from: formatTime(suggestion.startsAt),
      to: formatTime(suggestion.endsAt),
      date: suggestion.startsAt.toISOString().slice(0, 10),
    })),
    similarFree: check.similarFree.map((item) => ({ id: item.resource.id, name: item.resource.name, label: item.label })),
  };
}

function revalidateBooking() {
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  revalidatePath("/resources");
  revalidatePath("/reservations");
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/reports");
  revalidatePath("/activity");
}

/* --------------------------------------------------------------- auth */

export async function signInAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseForm(signInInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const result = await signIn(parsed.data.email, parsed.data.password);
  if (!result.ok) return errorState(result.message);

  redirect(parsed.data.redirectTo ?? "/dashboard");
}

export async function signUpAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = parseForm(signUpInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const result = await signUp(parsed.data);
  if (!result.ok) return errorState(result.message);

  // Deliberately the same message whether or not the address was already
  // known, so the form cannot be used to discover who has an account.
  return successState(
    "If that address is new, a confirmation link is on its way to it. New accounts also need an admin to enable them, " +
      "so sign in once yours has been approved.",
  );
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/sign-in");
}

/* -------------------------------------------------------- reservations */

export async function createReservationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(createReservationInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const input = parsed.data;
  let booked: { code: string; created: number; skipped: number };

  try {
    const result = await createReservation(user, {
      resourceId: input.resourceId,
      title: input.title,
      attendees: input.attendees,
      startsAt: fromLocal(input.date, toMinutes(input.from)),
      endsAt: fromLocal(input.date, toMinutes(input.to)),
      repeat: input.repeat === "none" ? undefined : { rule: input.repeat, untilISO: input.repeatUntil! },
    });

    if (!result.ok) {
      return { status: "error", message: result.check.message ?? "That time isn't available.", conflict: conflictFrom(result.check) };
    }

    revalidateBooking();
    booked = { code: result.reservation.code, created: result.created, skipped: result.skipped.length };
  } catch (error) {
    return toState(error);
  }

  // Outside the try: redirect() signals by throwing, and the banner belongs on
  // the list, where the new reservation is.
  const params = new URLSearchParams({ booked: booked.code });
  if (booked.created > 1) params.set("created", String(booked.created));
  if (booked.skipped) params.set("skipped", String(booked.skipped));
  redirect(`/reservations?${params.toString()}`);
}

export async function editReservationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(editReservationInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const input = parsed.data;
  let moved: string;

  try {
    const result = await rescheduleReservation(user, input.id, {
      startsAt: fromLocal(input.date, toMinutes(input.from)),
      endsAt: fromLocal(input.date, toMinutes(input.to)),
      title: input.title,
      attendees: input.attendees,
    });

    if (!result.ok) {
      return { status: "error", message: result.check.message ?? "That time isn't available.", conflict: conflictFrom(result.check) };
    }

    revalidateBooking();
    moved = result.reservation.code;
  } catch (error) {
    return toState(error);
  }

  redirect(`/reservations?updated=${moved}`);
}

export async function cancelReservationAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(cancelInput, form);
  if (!parsed.ok) return errorState("Something was missing from that request.", parsed.errors);

  try {
    const cancelled = await cancelReservation(user, parsed.data.id, parsed.data.reason ?? null);
    revalidateBooking();
    return successState(cancelled ? `${cancelled.code} was cancelled. The slot is free for others again.` : "Reservation cancelled.");
  } catch (error) {
    return toState(error);
  }
}

export async function checkInAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseForm(reservationIdInput, form);
  if (!parsed.ok) return errorState("Something was missing from that request.", parsed.errors);

  try {
    const reservation = await checkIn(user, parsed.data.id);
    revalidateBooking();
    return successState(reservation ? `Checked in to ${reservation.resource.name}. The room is yours.` : "Checked in.");
  } catch (error) {
    return toState(error);
  }
}

/* ----------------------------------------------------------- approvals */

export async function approveAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(decisionInput, form);
  if (!parsed.ok) return errorState("Something was missing from that request.", parsed.errors);

  let decided: { code: string; autoRejected: number };

  try {
    const { reservation, autoRejected } = await approveReservation(admin, parsed.data.id, parsed.data.note ?? null);
    revalidateBooking();
    decided = { code: reservation.code, autoRejected: autoRejected.length };
  } catch (error) {
    return toState(error);
  }

  // The queue reorders after a decision, so the outcome belongs to the page,
  // not to whichever request happens to be selected next.
  const params = new URLSearchParams({ decided: decided.code, outcome: "approved" });
  if (decided.autoRejected) params.set("autoRejected", String(decided.autoRejected));
  redirect(`/admin/approvals?${params.toString()}`);
}

export async function rejectAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(rejectInput, form);
  if (!parsed.ok) return errorState("Give a reason, so the requester knows what to do next.", parsed.errors);

  let code: string;

  try {
    const reservation = await rejectReservation(admin, parsed.data.id, parsed.data.note);
    revalidateBooking();
    code = reservation.code;
  } catch (error) {
    return toState(error);
  }

  redirect(`/admin/approvals?decided=${code}&outcome=rejected`);
}

/* ------------------------------------------------- resources (admin) */

export async function upsertResourceAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(resourceInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const input = parsed.data;
  const payload: ResourceInput = {
    name: input.name,
    typeId: input.typeId,
    locationId: input.locationId,
    description: input.description,
    capacity: input.capacity,
    requiresApproval: input.requiresApproval,
    requiresCheckIn: input.requiresCheckIn,
    slotMinutes: input.slotMinutes,
    maxMinutes: input.maxMinutes,
    openMinute: toMinutes(input.openFrom),
    closeMinute: toMinutes(input.openTo),
    openDays: input.openDays,
    bookAheadDays: input.bookAheadDays,
    status: input.status,
    amenities: input.amenities
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    managedBy: input.managedBy || null,
  };

  try {
    const result = input.id ? await updateResource(admin, input.id, payload) : await createResource(admin, payload);
    revalidatePath("/admin/resources");
    revalidatePath("/resources");
    revalidatePath("/schedule");
    revalidatePath("/dashboard");

    const warning = result.affected.length
      ? ` ${result.affected.length} upcoming ${result.affected.length === 1 ? "reservation no longer fits" : "reservations no longer fit"} the new rules — nothing was cancelled, review them below.`
      : "";
    return successState(`${input.id ? "Saved" : "Added"} ${result.resource.name}.${warning}`, { createdId: result.resource.id });
  } catch (error) {
    return toState(error);
  }
}

export async function retireResourceAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (!id) return errorState("Pick a resource to retire.");

  try {
    const { resource, upcoming } = await retireResource(admin, id);
    revalidatePath("/admin/resources");
    revalidatePath("/resources");
    const tail = upcoming.length
      ? ` ${upcoming.length} upcoming ${upcoming.length === 1 ? "reservation is" : "reservations are"} still on it — cancel or move them.`
      : "";
    return successState(`${resource.name} is retired and can't be booked again.${tail}`);
  } catch (error) {
    return toState(error);
  }
}

export async function blockTimeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(blockTimeInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  const input = parsed.data;
  try {
    const { cancelled } = await blockTime(admin, {
      resourceId: input.resourceId,
      startsAt: fromLocal(input.date, toMinutes(input.from)),
      endsAt: fromLocal(input.date, toMinutes(input.to)),
      reason: input.reason,
    });

    revalidateBooking();
    revalidatePath("/admin/resources");

    const tail = cancelled.length
      ? ` ${cancelled.length} ${cancelled.length === 1 ? "reservation was" : "reservations were"} cancelled and the ${cancelled.length === 1 ? "owner was" : "owners were"} told.`
      : " Nothing was booked in that window.";
    return successState(`Time blocked.${tail}`);
  } catch (error) {
    return toState(error);
  }
}

/* ----------------------------------------------------- users (admin) */

export async function inviteUserAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(inviteUserInput, form);
  if (!parsed.ok) return errorState("Check the form and try again.", parsed.errors);

  try {
    const user = await inviteUser(admin, {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      departmentId: parsed.data.departmentId || null,
      temporaryPassword: parsed.data.temporaryPassword,
    });
    revalidatePath("/admin/users");
    return successState(`${user.name} can now sign in with the temporary password you set.`);
  } catch (error) {
    return toState(error);
  }
}

export async function setRoleAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(setRoleInput, form);
  if (!parsed.ok) return errorState("Something was missing from that request.", parsed.errors);

  try {
    const user = await setRole(admin, parsed.data.userId, parsed.data.role);
    revalidatePath("/admin/users");
    return successState(`${user.name} is now ${user.role === "admin" ? "an admin" : "a member"}.`);
  } catch (error) {
    return toState(error);
  }
}

export async function setActiveAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = parseForm(setActiveInput, form);
  if (!parsed.ok) return errorState("Something was missing from that request.", parsed.errors);

  try {
    const user = await setActive(admin, parsed.data.userId, parsed.data.isActive);
    revalidatePath("/admin/users");
    return successState(user.isActive ? `${user.name} can sign in again.` : `${user.name} has been deactivated.`);
  } catch (error) {
    return toState(error);
  }
}
