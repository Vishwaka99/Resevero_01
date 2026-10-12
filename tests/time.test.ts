import { describe, expect, it } from "vitest";

import { addDaysISO, formatRange, formatTime, fromLocal, overlaps, startOfLocalWeekISO, toLocalDayISO } from "@/lib/domain/time";
import { at } from "./helpers";

describe("local time", () => {
  it("round-trips a wall-clock time through UTC", () => {
    const instant = fromLocal("2026-10-14", 9 * 60 + 30);
    expect(formatTime(instant)).toBe("09:30");
    expect(toLocalDayISO(instant)).toBe("2026-10-14");
  });

  it("formats a range with an en dash and no spaces", () => {
    expect(formatRange(at("2026-10-14", "09:30"), at("2026-10-14", "11:00"))).toBe("09:30–11:00");
  });

  it("finds the Monday of a week, including from a Sunday", () => {
    expect(startOfLocalWeekISO("2026-10-14")).toBe("2026-10-12"); // Wednesday
    expect(startOfLocalWeekISO("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(startOfLocalWeekISO("2026-10-12")).toBe("2026-10-12"); // Monday itself
  });

  it("steps days across a month boundary", () => {
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysISO("2026-11-01", -1)).toBe("2026-10-31");
  });
});

describe("overlap", () => {
  const range = (from: string, to: string) => ({ start: at("2026-10-14", from), end: at("2026-10-14", to) });

  it("treats intervals as half-open, so touching bookings do not clash", () => {
    expect(overlaps(range("10:00", "11:00"), range("11:00", "12:00"))).toBe(false);
    expect(overlaps(range("11:00", "12:00"), range("10:00", "11:00"))).toBe(false);
  });

  it("catches a partial overlap from either side", () => {
    expect(overlaps(range("10:00", "11:00"), range("10:30", "11:30"))).toBe(true);
    expect(overlaps(range("10:30", "11:30"), range("10:00", "11:00"))).toBe(true);
  });

  it("catches one booking fully inside another", () => {
    expect(overlaps(range("09:00", "17:00"), range("11:00", "12:00"))).toBe(true);
    expect(overlaps(range("11:00", "12:00"), range("09:00", "17:00"))).toBe(true);
  });

  it("catches an identical booking", () => {
    expect(overlaps(range("11:00", "12:00"), range("11:00", "12:00"))).toBe(true);
  });
});
