import type { Interval } from "./types";

/** Every instant is stored in UTC and displayed in the organisation's timezone. */
export const ORG_TIME_ZONE = process.env.ORG_TIME_ZONE ?? "Asia/Colombo";

const HH_MM = new Intl.DateTimeFormat("en-GB", {
  timeZone: ORG_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DAY_SHORT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ORG_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const DAY_LONG = new Intl.DateTimeFormat("en-GB", {
  timeZone: ORG_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const ISO_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: ORG_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

/** The wall-clock reading of an instant in the organisation's timezone. */
export function localParts(instant: Date): LocalParts {
  const found: Record<string, string> = {};
  for (const part of PARTS.formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour === "24" ? "0" : found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
    weekday: WEEKDAY_INDEX[found.weekday] ?? 0,
  };
}

/** The offset of the organisation's timezone at a given instant, in minutes. */
function offsetMinutes(instant: Date): number {
  const p = localParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Builds the instant for a local wall-clock time, e.g. "2026-10-14 09:30" in
 * Colombo. Two passes settle the offset correctly across a DST boundary.
 */
export function fromLocal(dayISO: string, minutesFromMidnight: number): Date {
  const [year, month, day] = dayISO.split("-").map(Number);
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(naive - offsetMinutes(new Date(naive)) * 60000);
  guess = new Date(naive - offsetMinutes(guess) * 60000);
  return guess;
}

/** `2026-10-14` for the local day an instant falls on. */
export function toLocalDayISO(instant: Date): string {
  return ISO_DAY.format(instant);
}

/** Today in the organisation's timezone, as `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  return toLocalDayISO(now);
}

/** Midnight at the start of a local day, as an instant. */
export function startOfLocalDay(dayISO: string): Date {
  return fromLocal(dayISO, 0);
}

/** Midnight at the start of the next local day, as an instant. */
export function endOfLocalDay(dayISO: string): Date {
  return fromLocal(addDaysISO(dayISO, 1), 0);
}

export function addDaysISO(dayISO: string, days: number): string {
  const [year, month, day] = dayISO.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return ISO_DAY.format(shifted);
}

/** The Monday of the week a local day belongs to. */
export function startOfLocalWeekISO(dayISO: string): string {
  const weekday = localParts(startOfLocalDay(dayISO)).weekday;
  const backTo = weekday === 0 ? 6 : weekday - 1;
  return addDaysISO(dayISO, -backTo);
}

/** Minutes from local midnight, e.g. 09:30 → 570. */
export function minutesFromMidnight(instant: Date): number {
  const p = localParts(instant);
  return p.hour * 60 + p.minute;
}

/** Decimal hours in local time, which is what the timeline component wants. */
export function toDecimalHour(instant: Date): number {
  return minutesFromMidnight(instant) / 60;
}

/** The local weekday of an instant, 0 = Sunday. */
export function localWeekday(instant: Date): number {
  return localParts(instant).weekday;
}

/* ------------------------------------------------------------- formatting */

/** `09:30` — always 24-hour, so columns of times line up. */
export function formatTime(instant: Date): string {
  return HH_MM.format(instant);
}

/** `09:30–11:00` — an en dash with no spaces inside, per the content rules. */
export function formatRange(start: Date, end: Date): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** `Tue 14 Oct` */
export function formatDay(instant: Date): string {
  return DAY_SHORT.format(instant);
}

/** `Tuesday 14 October` */
export function formatDayLong(instant: Date): string {
  return DAY_LONG.format(instant);
}

/** `Tue 14 Oct · 09:30–11:00` */
export function formatWhen(start: Date, end: Date): string {
  return `${formatDay(start)} · ${formatRange(start, end)}`;
}

/** `1 h 30 min`, `45 min`, `2 h` */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** `in 24 min`, `2 h ago`, `just now` — for queue ages and countdowns. */
export function formatRelative(instant: Date, now: Date = new Date()): string {
  const diffMinutes = Math.round((instant.getTime() - now.getTime()) / 60000);
  const magnitude = Math.abs(diffMinutes);
  if (magnitude < 1) return "just now";

  let value = magnitude;
  let unit = "min";
  if (magnitude >= 60 * 24) {
    value = Math.round(magnitude / (60 * 24));
    unit = value === 1 ? "day" : "days";
  } else if (magnitude >= 60) {
    value = Math.round(magnitude / 60);
    unit = "h";
  }
  return diffMinutes > 0 ? `in ${value} ${unit}` : `${value} ${unit} ago`;
}

export function durationMinutes({ start, end }: Interval): number {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

/* ------------------------------------------------------------- intervals */

/** Half-open overlap test, the same rule as the Postgres exclusion constraint: `tstzrange(starts_at, ends_at, '[)') &&`. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60000);
}
