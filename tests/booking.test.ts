import { beforeEach, describe, expect, it } from "vitest";

import { checkSlot } from "@/lib/server/availability";
import { cancelReservation, checkIn, createReservation, settleOverdue } from "@/lib/server/reservations";
import { approveReservation, listApprovalQueue, rejectReservation } from "@/lib/server/approvals";
import { blockTime } from "@/lib/server/resources";
import { getDataStore } from "@/lib/data";
import { addMinutes } from "@/lib/domain/time";
import { ADMIN_EMAIL, asUser, at, BOARD_ROOM_A, freshStore, MEMBER_EMAIL, nextMonday, VAN } from "./helpers";

let day: string;

beforeEach(async () => {
  await freshStore();
  day = nextMonday();
});

describe("creating a reservation", () => {
  it("confirms straight away when the resource needs no approval", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const result = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.status).toBe("confirmed");
    expect(result.reservation.code).toMatch(/^RSV-\d+$/);
  });

  it("waits for approval when the resource is set to need it", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const result = await createReservation(member, {
      resourceId: VAN,
      title: "Site visit",
      attendees: 3,
      startsAt: at(day, "08:00"),
      endsAt: at(day, "12:00"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.status).toBe("pending");
  });

  it("refuses an overlapping slot and names the clash", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const first = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Finance sync",
      attendees: 4,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:30"),
    });
    expect(first.ok).toBe(true);

    const second = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Client call",
      attendees: 2,
      startsAt: at(day, "10:00"),
      endsAt: at(day, "11:00"),
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.check.reason).toBe("overlap");
    expect(second.check.message).toContain("Board Room A is already booked");
    expect(second.check.suggestions.length).toBeGreaterThan(0);
  });

  it("allows a booking that starts exactly when another ends", async () => {
    const member = await asUser(MEMBER_EMAIL);
    await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Finance sync",
      attendees: 4,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });

    const back_to_back = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "10:00"),
      endsAt: at(day, "11:00"),
    });

    expect(back_to_back.ok).toBe(true);
  });

  /**
   * The guarantee the whole product rests on: the pre-flight check can be
   * raced, so the write itself has to be the one that refuses. In Postgres
   * this is the exclusion constraint; in the in-memory adapter it is a
   * per-resource lock. Either way, exactly one of these may win.
   */
  it("lets only one of two simultaneous bookings for the same slot win", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const admin = await asUser(ADMIN_EMAIL);

    const [a, b] = await Promise.all([
      createReservation(member, {
        resourceId: BOARD_ROOM_A,
        title: "Member booking",
        attendees: 2,
        startsAt: at(day, "13:00"),
        endsAt: at(day, "14:00"),
      }),
      createReservation(admin, {
        resourceId: BOARD_ROOM_A,
        title: "Admin booking",
        attendees: 2,
        startsAt: at(day, "13:00"),
        endsAt: at(day, "14:00"),
      }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);

    const held = await getDataStore().reservations.findOverlapping(BOARD_ROOM_A, at(day, "13:00"), at(day, "14:00"));
    expect(held).toHaveLength(1);
  });

  it("skips the dates of a repeat where the slot is already taken", async () => {
    const admin = await asUser(ADMIN_EMAIL);
    const member = await asUser(MEMBER_EMAIL);
    const nextWeek = new Date(at(day, "15:00").getTime() + 7 * 24 * 60 * 60 * 1000);

    // Someone already holds the same slot one week later.
    await createReservation(admin, {
      resourceId: BOARD_ROOM_A,
      title: "Board meeting",
      attendees: 8,
      startsAt: nextWeek,
      endsAt: addMinutes(nextWeek, 60),
    });

    const repeated = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Weekly sync",
      attendees: 3,
      startsAt: at(day, "15:00"),
      endsAt: at(day, "16:00"),
      repeat: { rule: "weekly", untilISO: new Date(nextWeek.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
    });

    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    expect(repeated.skipped).toHaveLength(1);
    expect(repeated.skipped[0].reason).toContain("already booked");
  });
});

describe("booking rules", () => {
  it("refuses a time outside the resource's bookable hours", async () => {
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: at(day, "07:00"), endsAt: at(day, "08:00") });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("closed");
  });

  it("refuses a booking longer than the resource allows", async () => {
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: at(day, "08:00"), endsAt: at(day, "17:00") });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("too_long");
  });

  it("refuses a start that does not sit on a slot boundary", async () => {
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: at(day, "09:10"), endsAt: at(day, "09:40") });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("misaligned");
  });

  it("refuses more people than the resource holds, and offers bigger ones", async () => {
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: at(day, "09:00"), endsAt: at(day, "10:00"), attendees: 40 });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("over_capacity");
    expect(check.similarFree.every((item) => item.resource.capacity >= 40)).toBe(true);
  });

  it("refuses a day the resource is closed", async () => {
    const saturday = new Date(at(day, "09:00").getTime() + 5 * 24 * 60 * 60 * 1000);
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: saturday, endsAt: addMinutes(saturday, 60) });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("closed_day");
  });

  it("refuses a time in the past", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const check = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: yesterday, endsAt: addMinutes(yesterday, 60) });
    expect(check.free).toBe(false);
    expect(check.reason).toBe("past");
  });
});

describe("approvals", () => {
  it("confirms the request and auto-rejects the ones that clash with it", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const other = await asUser("kasun@reservo.test");
    const admin = await asUser(ADMIN_EMAIL);

    const mine = await createReservation(member, {
      resourceId: VAN,
      title: "Site visit",
      attendees: 4,
      startsAt: at(day, "08:00"),
      endsAt: at(day, "17:00"),
    });
    const theirs = await createReservation(other, {
      resourceId: VAN,
      title: "Supplier pickup",
      attendees: 2,
      startsAt: at(day, "13:00"),
      endsAt: at(day, "17:00"),
    });

    expect(mine.ok && theirs.ok).toBe(true);
    if (!mine.ok || !theirs.ok) return;

    const { reservation, autoRejected } = await approveReservation(admin, mine.reservation.id, null);

    expect(reservation.status).toBe("confirmed");
    expect(autoRejected.map((item) => item.id)).toContain(theirs.reservation.id);

    const loser = await getDataStore().reservations.findById(theirs.reservation.id);
    expect(loser?.status).toBe("rejected");
    expect(loser?.decisionNote).toContain("another request");
  });

  it("requires a reason when rejecting", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const admin = await asUser(ADMIN_EMAIL);

    const request = await createReservation(member, {
      resourceId: VAN,
      title: "Site visit",
      attendees: 4,
      startsAt: at(day, "08:00"),
      endsAt: at(day, "12:00"),
    });
    expect(request.ok).toBe(true);
    if (!request.ok) return;

    await expect(rejectReservation(admin, request.reservation.id, "   ")).rejects.toThrow(/reason/i);

    const rejected = await rejectReservation(admin, request.reservation.id, "The van is already out that day.");
    expect(rejected.status).toBe("rejected");
    expect(rejected.decisionNote).toBe("The van is already out that day.");
  });

  it("will not decide the same request twice", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const admin = await asUser(ADMIN_EMAIL);

    const request = await createReservation(member, {
      resourceId: VAN,
      title: "Site visit",
      attendees: 4,
      startsAt: at(day, "08:00"),
      endsAt: at(day, "12:00"),
    });
    if (!request.ok) throw new Error("setup failed");

    await approveReservation(admin, request.reservation.id, null);
    await expect(approveReservation(admin, request.reservation.id, null)).rejects.toThrow(/already been decided/i);
  });

  /**
   * A pending request is a bid, not a hold: two people may ask for the same
   * van, and the admin chooses. If pending locked the slot, the second person
   * could never put their case and this feature would be dead code.
   */
  it("lets two people ask for the same slot on a resource that needs approval", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const other = await asUser("kasun@reservo.test");

    const first = await createReservation(member, { resourceId: VAN, title: "Site visit", attendees: 2, startsAt: at(day, "08:00"), endsAt: at(day, "17:00") });
    const second = await createReservation(other, { resourceId: VAN, title: "Supplier pickup", attendees: 2, startsAt: at(day, "13:00"), endsAt: at(day, "17:00") });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reservation.status).toBe("pending");
  });

  it("warns about a competing request without blocking the booking", async () => {
    const other = await asUser("kasun@reservo.test");
    await createReservation(other, { resourceId: VAN, title: "Supplier pickup", attendees: 2, startsAt: at(day, "13:00"), endsAt: at(day, "17:00") });

    const check = await checkSlot({ resourceId: VAN, startsAt: at(day, "14:00"), endsAt: at(day, "16:00") });
    expect(check.free).toBe(true);
    expect(check.competing).toHaveLength(1);
    expect(check.competing[0].title).toBe("Supplier pickup");
  });

  it("refuses to approve a request whose slot was confirmed in the meantime", async () => {
    const store = getDataStore();
    const member = await asUser(MEMBER_EMAIL);
    const other = await asUser("kasun@reservo.test");
    const admin = await asUser(ADMIN_EMAIL);

    const first = await createReservation(member, { resourceId: VAN, title: "Site visit", attendees: 2, startsAt: at(day, "08:00"), endsAt: at(day, "12:00") });
    const second = await createReservation(other, { resourceId: VAN, title: "Supplier pickup", attendees: 2, startsAt: at(day, "10:00"), endsAt: at(day, "14:00") });
    if (!first.ok || !second.ok) throw new Error("setup failed");

    // Confirm the first one without going through the approval service, so the
    // second is left pending against a slot that is now taken.
    await store.reservations.update(first.reservation.id, { status: "confirmed" });

    await expect(approveReservation(admin, second.reservation.id, null)).rejects.toThrow(/was booked for/i);
  });

  it("shows a clashing request in the queue so the admin sees the trade-off", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const other = await asUser("kasun@reservo.test");

    await createReservation(member, { resourceId: VAN, title: "A", attendees: 2, startsAt: at(day, "08:00"), endsAt: at(day, "17:00") });
    await createReservation(other, { resourceId: VAN, title: "B", attendees: 2, startsAt: at(day, "13:00"), endsAt: at(day, "17:00") });

    const queue = await listApprovalQueue();
    const vanRequests = queue.filter((item) => item.reservation.resourceId === VAN);
    expect(vanRequests.length).toBeGreaterThanOrEqual(2);
    expect(vanRequests.some((item) => item.overlaps.length > 0)).toBe(true);
  });
});

describe("cancelling, check-in and release", () => {
  it("frees the slot when a reservation is cancelled", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    await cancelReservation(member, booking.reservation.id, "Moved to a call");

    const sameSlot = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Something else",
      attendees: 2,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });
    expect(sameSlot.ok).toBe(true);
  });

  it("stops a member cancelling someone else's reservation", async () => {
    const admin = await asUser(ADMIN_EMAIL);
    const member = await asUser(MEMBER_EMAIL);

    const theirs = await createReservation(admin, {
      resourceId: BOARD_ROOM_A,
      title: "Board meeting",
      attendees: 8,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });
    if (!theirs.ok) throw new Error("setup failed");

    await expect(cancelReservation(member, theirs.reservation.id, null)).rejects.toThrow(/belongs to someone else/i);
  });

  it("refuses a check-in before the window opens", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "15:00"),
      endsAt: at(day, "16:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    await expect(checkIn(member, booking.reservation.id)).rejects.toThrow(/Check-in opens/i);
  });

  it("accepts a check-in inside the window", async () => {
    const member = await asUser(MEMBER_EMAIL);
    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "15:00"),
      endsAt: at(day, "16:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    const fiveMinutesIn = addMinutes(at(day, "15:00"), 5);
    const checked = await checkIn(member, booking.reservation.id, fiveMinutesIn);
    expect(checked?.checkedInAt).not.toBeNull();
  });

  it("releases a room nobody claimed, and lets someone else take the slot", async () => {
    const store = getDataStore();
    const member = await asUser(MEMBER_EMAIL);
    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "15:00"),
      endsAt: at(day, "16:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    const twentyMinutesIn = addMinutes(at(day, "15:00"), 20);
    const swept = await settleOverdue(twentyMinutesIn);
    expect(swept.released).toBeGreaterThanOrEqual(1);

    const released = await store.reservations.findById(booking.reservation.id);
    expect(released?.status).toBe("cancelled");
    expect(released?.cancelReason).toContain("Released automatically");

    const stillBlocking = await store.reservations.findOverlapping(BOARD_ROOM_A, at(day, "15:00"), at(day, "16:00"));
    expect(stillBlocking).toHaveLength(0);
  });

  it("leaves a reservation alone once it has been checked in", async () => {
    const store = getDataStore();
    const member = await asUser(MEMBER_EMAIL);
    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "15:00"),
      endsAt: at(day, "16:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    await checkIn(member, booking.reservation.id, addMinutes(at(day, "15:00"), 5));
    await settleOverdue(addMinutes(at(day, "15:00"), 20));

    const kept = await store.reservations.findById(booking.reservation.id);
    expect(kept?.status).toBe("confirmed");
  });
});

describe("maintenance", () => {
  it("cancels the bookings inside a blocked window and keeps the slot unbookable", async () => {
    const admin = await asUser(ADMIN_EMAIL);
    const member = await asUser(MEMBER_EMAIL);

    const booking = await createReservation(member, {
      resourceId: BOARD_ROOM_A,
      title: "Design review",
      attendees: 4,
      startsAt: at(day, "09:00"),
      endsAt: at(day, "10:00"),
    });
    if (!booking.ok) throw new Error("setup failed");

    const { cancelled } = await blockTime(admin, {
      resourceId: BOARD_ROOM_A,
      startsAt: at(day, "08:00"),
      endsAt: at(day, "12:00"),
      reason: "Repainting",
    });

    expect(cancelled.map((item) => item.id)).toContain(booking.reservation.id);

    const blocked = await checkSlot({ resourceId: BOARD_ROOM_A, startsAt: at(day, "09:00"), endsAt: at(day, "10:00") });
    expect(blocked.free).toBe(false);
    expect(blocked.reason).toBe("blackout");
  });
});
