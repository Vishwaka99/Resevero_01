import { beforeEach, describe, expect, it } from "vitest";

import { conflictTitle, offersAlternatives } from "@/lib/bff/conflict-copy";
import { buildAvailabilityAnswer } from "@/lib/bff/views";
import { at, BOARD_ROOM_A, freshStore, nextMonday } from "./helpers";

/**
 * A refusal has to be framed by its own reason.
 *
 * This exists because of a real report: a booking that ran past the
 * resource's limit came back headed "that time isn't free", followed by
 * "nothing similar is free then, try another day". Both were false. The time
 * was free; the booking was too long, and no other day would have helped.
 */
describe("framing a refusal", () => {
  beforeEach(async () => {
    await freshStore();
  });

  it("calls an over-long booking too long, not taken", async () => {
    const day = nextMonday();
    // Board Room A allows 4 h; ask for the whole working day.
    const answer = await buildAvailabilityAnswer({ resourceId: BOARD_ROOM_A, date: day, from: "08:00", to: "18:00" });

    expect(answer.free).toBe(false);
    expect(answer.conflict?.reason).toBe("too_long");
    expect(conflictTitle(answer.conflict!.reason)).toBe("That booking is too long");
    // The message names the limit, so the heading must not contradict it.
    expect(answer.conflict?.message).toMatch(/up to \d+ h at a time/);
  });

  it("does not offer another day for a refusal another day cannot fix", async () => {
    for (const reason of ["too_long", "too_short", "over_capacity", "misaligned", "not_bookable"]) {
      expect(offersAlternatives(reason), `${reason} should not offer alternatives`).toBe(false);
    }
  });

  it("does offer another time when the time really is the problem", async () => {
    for (const reason of ["overlap", "blackout", "closed", "closed_day", "past", "too_far_ahead"]) {
      expect(offersAlternatives(reason), `${reason} should offer alternatives`).toBe(true);
    }
  });

  it("still calls a genuine clash what it is", async () => {
    const day = nextMonday();
    const store = await freshStore();
    const [member] = (await store.users.list()).filter((user) => user.email === "member@reservo.test");
    await store.reservations.createGuarded({
      resourceId: BOARD_ROOM_A,
      userId: member.id,
      title: "Standup",
      attendees: 3,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
      status: "confirmed",
      seriesId: null,
    });

    const answer = await buildAvailabilityAnswer({ resourceId: BOARD_ROOM_A, date: day, from: "09:30", to: "10:30" });
    expect(answer.conflict?.reason).toBe("overlap");
    expect(conflictTitle(answer.conflict!.reason)).toBe("That time isn't free");
    expect(offersAlternatives(answer.conflict!.reason)).toBe(true);
  });

  it("falls back rather than showing a blank heading", () => {
    expect(conflictTitle("something_new")).toBe("That time isn't available");
  });
});
