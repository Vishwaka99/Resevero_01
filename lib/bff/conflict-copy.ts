import type { ConflictReason } from "@/lib/server/availability";

/**
 * How a refused booking is headed, and whether offering another time would
 * help.
 *
 * The check gives one precise sentence about what is wrong; this only has to
 * frame it. Framing it wrongly is worse than framing it vaguely — a booking
 * refused for running past the resource's limit used to be headed "that time
 * isn't free", which sends someone hunting for a free slot when the time was
 * never the problem.
 *
 * Typed as a complete record, so adding a reason to `ConflictReason` without
 * a heading fails the build rather than quietly falling back.
 */
export const CONFLICT_TITLES: Record<ConflictReason, string> = {
  overlap: "That time isn't free",
  blackout: "That time is blocked",
  closed: "Outside opening hours",
  closed_day: "Not open that day",
  past: "That time has passed",
  too_long: "That booking is too long",
  too_short: "Check the start and end",
  too_far_ahead: "Too far ahead",
  not_bookable: "Not available to book",
  over_capacity: "Too many people",
  misaligned: "Pick a whole slot",
};

/**
 * The reasons a different time, or a different resource, actually fixes.
 *
 * Everything else is a rule about the booking itself — too long, too many
 * people, off the slot grid — and those are fixed by changing the booking,
 * not by looking elsewhere. Suggesting alternatives there is advice that
 * cannot work.
 */
const ABOUT_AVAILABILITY = new Set<ConflictReason>(["overlap", "blackout", "closed", "closed_day", "past", "too_far_ahead"]);

/** The heading for a refusal, falling back for a reason we do not know. */
export function conflictTitle(reason: string): string {
  return CONFLICT_TITLES[reason as ConflictReason] ?? "That time isn't available";
}

/** Whether another time or resource is worth offering for this refusal. */
export function offersAlternatives(reason: string): boolean {
  return ABOUT_AVAILABILITY.has(reason as ConflictReason);
}
