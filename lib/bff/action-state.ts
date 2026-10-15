/**
 * The shape every server action returns, so forms render results the same way.
 * Kept out of the "use server" module, which may only export async functions.
 */

import type { FieldErrors } from "./schemas";

export type ConflictInfo = {
  /**
   * Why the booking was refused. The form needs it because only some of these
   * are about the time being taken: telling someone their booking is too long
   * under the heading "that time isn't free" sends them looking for a free
   * slot that was never the problem.
   */
  reason: string;
  message: string;
  suggestions: Array<{ label: string; from: string; to: string; date: string }>;
  similarFree: Array<{ id: string; name: string; label: string }>;
};

export type ActionState = {
  status: "idle" | "success" | "error";
  /** One sentence for the user. Success messages name what happened. */
  message?: string;
  /** Field-level validation messages, keyed by input name. */
  errors?: FieldErrors;
  /** Present when a write was refused by the availability check. */
  conflict?: ConflictInfo;
  /**
   * What was typed, so a refused form can be rendered with it still in place
   * rather than making someone retype everything. Passwords are never in here.
   */
  values?: Record<string, string>;
  /** Set on success so the screen can link to what was created. */
  createdId?: string;
  createdCode?: string;
};

export const IDLE: ActionState = { status: "idle" };

export function errorState(message: string, errors?: FieldErrors): ActionState {
  return { status: "error", message, errors };
}

export function successState(message: string, extra: Partial<ActionState> = {}): ActionState {
  return { status: "success", message, ...extra };
}
