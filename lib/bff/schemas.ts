/**
 * Input validation for the BFF.
 *
 * Nothing reaches a domain service without passing through one of these. The
 * same schemas validate query strings on route handlers and `FormData` in
 * server actions, so a hand-crafted request is checked exactly like the form.
 */

import { z } from "zod";

const DAY_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const dayISO = z.string().regex(DAY_ISO, "Use a date in YYYY-MM-DD form.");
export const timeHHMM = z.string().regex(HH_MM, "Use a 24-hour time, like 09:30.");

/** `09:30` → 570 minutes from midnight. */
export function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

export const viewMode = z.enum(["full", "compact"]).default("full");

/**
 * An HTML checkbox sends `on` when ticked and nothing when cleared, so plain
 * boolean coercion would read the string "false" as true. This reads both the
 * browser's convention and an explicit JSON boolean.
 */
export const checkbox = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase();
  return text === "on" || text === "true" || text === "1" || text === "yes";
}, z.boolean());

/** A group of checkboxes: one tick arrives as a scalar, several as an array. */
function asArray<Item extends z.ZodType>(item: Item) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  }, z.array(item));
}

/* --------------------------------------------------------------- reads */

export const scheduleQuery = z.object({
  date: dayISO.optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  view: viewMode,
});

export const resourcesQuery = z.object({
  date: dayISO.optional(),
  from: timeHHMM.optional(),
  to: timeHHMM.optional(),
  type: z.string().optional(),
  location: z.string().optional(),
  minCapacity: z.coerce.number().int().min(0).max(1000).optional(),
  amenity: z.string().optional(),
  q: z.string().max(120).optional(),
  sort: z.enum(["match", "name", "capacity", "availability"]).default("match"),
  view: viewMode,
});

export const resourceDetailQuery = z.object({
  week: dayISO.optional(),
  view: viewMode,
});

export const availabilityQuery = z.object({
  resourceId: z.string().min(1),
  date: dayISO,
  from: timeHHMM,
  to: timeHHMM,
  attendees: z.coerce.number().int().min(1).max(1000).default(1),
  ignore: z.string().optional(),
});

export const myReservationsQuery = z.object({
  tab: z.enum(["upcoming", "pending", "past", "cancelled"]).default("upcoming"),
  type: z.string().optional(),
  window: z.enum(["30d", "90d", "all"]).default("30d"),
  cursor: z.coerce.number().int().min(0).default(0),
  view: viewMode,
});

export const approvalsQuery = z.object({
  selected: z.string().optional(),
  view: viewMode,
});

export const manageResourcesQuery = z.object({
  edit: z.string().optional(),
  view: viewMode,
});

export const reportsQuery = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
  view: viewMode,
});

/* -------------------------------------------------------------- writes */

export const signInInput = z.object({
  email: z.string().trim().min(1, "Enter your work email.").email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
  redirectTo: z.string().startsWith("/").optional(),
});

/**
 * Self-registration. Only a name, an address and a password: the role, the
 * department and whether the account is active are not the registrant's to
 * choose, so they are not in the form.
 */
export const signUpInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Enter your name.")
      .max(80, "Use 80 characters or fewer.")
      // Names vary far too much to pattern-match. This only rules out the
      // characters that would make one unreadable wherever it is shown.
      .regex(/^[^<>{}]*$/, "Remove any < > { } from your name."),
    email: z
      .string()
      .trim()
      .min(1, "Enter your work email.")
      .max(160, "Use 160 characters or fewer.")
      .email("That doesn't look like an email address."),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      // Supabase hashes with bcrypt, which ignores anything past 72 bytes.
      // Refusing is honest; truncating would leave someone with a password
      // that is not the one they think they chose.
      .max(72, "Use 72 characters or fewer.")
      .refine((value) => value.trim().length >= 8, "A password cannot be only spaces."),
    confirmPassword: z.string().min(1, "Repeat your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

export const createReservationInput = z
  .object({
    resourceId: z.string().min(1, "Pick a resource."),
    title: z.string().trim().min(2, "Give the booking a short purpose.").max(120),
    attendees: z.coerce.number().int().min(1, "At least one person.").max(1000),
    date: dayISO,
    from: timeHHMM,
    to: timeHHMM,
    repeat: z.enum(["none", "weekly", "weekdays"]).default("none"),
    repeatUntil: dayISO.optional(),
  })
  .refine((value) => toMinutes(value.to) > toMinutes(value.from), {
    message: "The end time has to be after the start time.",
    path: ["to"],
  })
  .refine((value) => value.repeat === "none" || Boolean(value.repeatUntil), {
    message: "Pick the date the repeat should stop.",
    path: ["repeatUntil"],
  });

export const editReservationInput = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(2).max(120),
    attendees: z.coerce.number().int().min(1).max(1000),
    date: dayISO,
    from: timeHHMM,
    to: timeHHMM,
  })
  .refine((value) => toMinutes(value.to) > toMinutes(value.from), {
    message: "The end time has to be after the start time.",
    path: ["to"],
  });

export const reservationIdInput = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
});

export const decisionInput = z.object({
  id: z.string().min(1),
  note: z.string().trim().max(300).optional(),
});

export const rejectInput = z.object({
  id: z.string().min(1),
  note: z.string().trim().min(3, "Give a reason, so the requester knows what to do next.").max(300),
});

const weekdayList = asArray(z.coerce.number().int().min(0).max(6)).refine((days) => days.length > 0, {
  message: "Pick at least one day the resource can be booked.",
});

export const resourceInput = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Give the resource a name.").max(80),
    typeId: z.string().min(1, "Pick a type."),
    locationId: z.string().min(1, "Pick a location."),
    description: z.string().trim().max(600).default(""),
    capacity: z.coerce.number().int().min(1, "Capacity is at least 1.").max(1000),
    requiresApproval: checkbox,
    requiresCheckIn: checkbox,
    slotMinutes: z.coerce.number().int().min(15).max(240),
    maxMinutes: z.coerce.number().int().min(15).max(1440),
    openFrom: timeHHMM,
    openTo: timeHHMM,
    openDays: weekdayList,
    bookAheadDays: z.coerce.number().int().min(1).max(365),
    status: z.enum(["active", "maintenance", "retired"]).default("active"),
    amenities: z.string().trim().max(400).default(""),
    managedBy: z.string().optional(),
  })
  .refine((value) => toMinutes(value.openTo) > toMinutes(value.openFrom), {
    message: "The closing time has to be after the opening time.",
    path: ["openTo"],
  })
  .refine((value) => value.maxMinutes % value.slotMinutes === 0, {
    message: "The longest booking has to be a whole number of slots.",
    path: ["maxMinutes"],
  });

export const blockTimeInput = z
  .object({
    resourceId: z.string().min(1, "Pick a resource."),
    date: dayISO,
    from: timeHHMM,
    to: timeHHMM,
    reason: z.string().trim().min(3, "Say why the resource is unavailable.").max(120),
  })
  .refine((value) => toMinutes(value.to) > toMinutes(value.from), {
    message: "The end has to be after the start.",
    path: ["to"],
  });

export const inviteUserInput = z.object({
  name: z.string().trim().min(2, "Enter their name.").max(80),
  email: z.string().trim().email("That doesn't look like an email address."),
  role: z.enum(["admin", "member"]).default("member"),
  departmentId: z.string().optional(),
  temporaryPassword: z.string().min(8, "Use at least 8 characters."),
});

export const setRoleInput = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

export const setActiveInput = z.object({
  userId: z.string().min(1),
  isActive: checkbox,
});

/* ------------------------------------------------------------- helpers */

/** Reads a `URLSearchParams` through a schema, with its defaults applied. */
export function parseQuery<Schema extends z.ZodType>(schema: Schema, params: URLSearchParams): z.infer<Schema> {
  return schema.parse(Object.fromEntries(params.entries()));
}

export type FieldErrors = Record<string, string>;

/** Flattens Zod issues into one message per field, which is what forms render. */
export function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Reads `FormData` through a schema. Checkboxes and repeated keys included. */
export function parseForm<Schema extends z.ZodType>(
  schema: Schema,
  form: FormData,
): { ok: true; data: z.infer<Schema> } | { ok: false; errors: FieldErrors } {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).map((value) => (value instanceof File ? value.name : value));
    raw[key] = values.length > 1 ? values : values[0];
  }

  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: fieldErrors(result.error) };
}

export { z };
