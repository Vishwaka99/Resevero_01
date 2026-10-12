/**
 * Development seed.
 *
 * Dates are built relative to "today" in the organisation's timezone, so the
 * dashboard, timeline and approvals queue look alive on whatever day the app is
 * opened. `scripts/seed.ts` loads this same data into Supabase, so both
 * adapters show the same application and there is one place to change it.
 */

import { addDaysISO, fromLocal, localToday, localWeekday, startOfLocalDay } from "@/lib/domain/time";
import { hashPassword } from "@/lib/auth/password";
import type {
  AuditLog,
  Blackout,
  Department,
  Location,
  Notification,
  RecurrenceSeries,
  Reservation,
  Resource,
  ResourceType,
  User,
} from "@/lib/domain/types";

export type Tables = {
  departments: Department[];
  users: User[];
  resourceTypes: ResourceType[];
  locations: Location[];
  resources: Resource[];
  series: RecurrenceSeries[];
  reservations: Reservation[];
  blackouts: Blackout[];
  notifications: Notification[];
  audit: AuditLog[];
  codeCounter: number;
};

/** The shared dev password for every seeded account. */
export const DEV_PASSWORD = "reservo123";

const MON_TO_FRI = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function at(dayISO: string, hhmm: string): Date {
  const [hour, minute] = hhmm.split(":").map(Number);
  return fromLocal(dayISO, hour * 60 + minute);
}

function isWeekday(dayISO: string): boolean {
  const weekday = localWeekday(startOfLocalDay(dayISO));
  return weekday >= 1 && weekday <= 5;
}

/**
 * The nth working day from an anchor, skipping weekends. Rooms are bookable
 * Mon-Fri, so anchoring the seed to working days keeps the demo data on days
 * the resources are actually open, whichever day the app is opened on.
 */
function businessDay(anchorISO: string, offset: number): string {
  let cursor = anchorISO;
  let remaining = Math.abs(offset);
  const step = offset < 0 ? -1 : 1;
  while (remaining > 0) {
    cursor = addDaysISO(cursor, step);
    if (isWeekday(cursor)) remaining -= 1;
  }
  return cursor;
}

export function buildSeed(now: Date = new Date()): Tables {
  const today = localToday(now);
  // On a weekend the working-day data starts on the coming Monday, so nothing
  // is seeded onto a day the rooms are closed.
  const anchor = isWeekday(today) ? today : businessDay(today, 1);
  const day = (offset: number) => businessDay(anchor, offset);
  const passwordHash = hashPassword(DEV_PASSWORD);

  const departments: Department[] = [
    { id: "dep-eng", name: "Engineering" },
    { id: "dep-fac", name: "Facilities" },
    { id: "dep-mkt", name: "Marketing" },
    { id: "dep-ops", name: "Operations" },
  ];

  const createdAt = at(day(-20), "09:00");
  const users: User[] = [
    { id: "usr-vi", name: "Vishwaka Bandara", email: "admin@reservo.test", passwordHash, role: "admin", departmentId: "dep-eng", isActive: true, createdAt },
    { id: "usr-aqsa", name: "Aqsa Shaikh", email: "member@reservo.test", passwordHash, role: "member", departmentId: "dep-ops", isActive: true, createdAt },
    { id: "usr-nimal", name: "Nimal Perera", email: "nimal@reservo.test", passwordHash, role: "admin", departmentId: "dep-fac", isActive: true, createdAt },
    { id: "usr-kavindi", name: "Kavindi Silva", email: "kavindi@reservo.test", passwordHash, role: "member", departmentId: "dep-mkt", isActive: true, createdAt },
    { id: "usr-kasun", name: "Kasun Jayawardena", email: "kasun@reservo.test", passwordHash, role: "member", departmentId: "dep-ops", isActive: true, createdAt },
    { id: "usr-ruwan", name: "Ruwan Fernando", email: "ruwan@reservo.test", passwordHash, role: "member", departmentId: "dep-eng", isActive: true, createdAt },
    { id: "usr-dilani", name: "Dilani Jayasuriya", email: "dilani@reservo.test", passwordHash, role: "member", departmentId: "dep-mkt", isActive: false, createdAt },
  ];

  const resourceTypes: ResourceType[] = [
    { id: "typ-room", name: "Room", icon: "building" },
    { id: "typ-equip", name: "Equipment", icon: "monitor" },
    { id: "typ-vehicle", name: "Vehicle", icon: "car" },
  ];

  const locations: Location[] = [
    { id: "loc-l1", building: "HQ", floor: "Level 1", name: "Level 1, HQ" },
    { id: "loc-l2", building: "HQ", floor: "Level 2", name: "Level 2, HQ" },
    { id: "loc-store", building: "HQ", floor: "Level 1", name: "Equipment store" },
    { id: "loc-park", building: "HQ", floor: null, name: "Car park" },
    { id: "loc-annex", building: "Annex", floor: "Ground", name: "Annex, ground floor" },
  ];

  const baseRoom = {
    requiresApproval: false,
    requiresCheckIn: true,
    slotMinutes: 30,
    maxMinutes: 240,
    openMinute: 8 * 60,
    closeMinute: 18 * 60,
    openDays: MON_TO_FRI,
    bookAheadDays: 60,
    status: "active" as const,
    createdAt,
  };

  const resources: Resource[] = [
    {
      ...baseRoom,
      id: "res-board-a",
      typeId: "typ-room",
      locationId: "loc-l2",
      name: "Board Room A",
      description:
        "Large meeting room facing the garden. Seats 12 around one table; 16 standing. Good for client meetings, workshops and interview panels.",
      capacity: 12,
      amenities: ['65" screen', "Video conferencing", "Whiteboard", "Wheelchair access"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-board-b",
      typeId: "typ-room",
      locationId: "loc-l2",
      name: "Board Room B",
      description: "Second board room, shares the Level 2 lobby. Being repainted this week.",
      capacity: 8,
      amenities: ["Screen", "Whiteboard"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-huddle-3",
      typeId: "typ-room",
      locationId: "loc-l1",
      name: "Huddle Room 3",
      description: "Small room for stand-ups, 1:1s and quick calls.",
      capacity: 4,
      maxMinutes: 120,
      amenities: ["Screen", "Wheelchair access"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-huddle-4",
      typeId: "typ-room",
      locationId: "loc-l1",
      name: "Huddle Room 4",
      description: "Small room beside the kitchen. Good for pairing.",
      capacity: 4,
      maxMinutes: 120,
      amenities: ["Screen"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-training",
      typeId: "typ-room",
      locationId: "loc-annex",
      name: "Training Room",
      description: "Flat floor room with movable tables, used for workshops and onboarding.",
      capacity: 30,
      maxMinutes: 480,
      amenities: ["Projector", "Whiteboard", "Wheelchair access"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-auditorium",
      typeId: "typ-room",
      locationId: "loc-annex",
      name: "Auditorium",
      description: "Tiered seating for 120. Needs sign-off because setup and cleaning are booked around it.",
      capacity: 120,
      requiresApproval: true,
      maxMinutes: 600,
      amenities: ["Stage", "PA system", "Projector", "Wheelchair access"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-proj-1",
      typeId: "typ-equip",
      locationId: "loc-store",
      name: "Projector P-01",
      description: "Portable projector with HDMI and USB-C, in a shoulder bag.",
      capacity: 1,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 480,
      amenities: ["HDMI", "USB-C"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-proj-2",
      typeId: "typ-equip",
      locationId: "loc-store",
      name: "Projector P-02",
      description: "Second portable projector. Lamp is being replaced today.",
      capacity: 1,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 480,
      status: "maintenance",
      amenities: ["HDMI"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-camera",
      typeId: "typ-equip",
      locationId: "loc-store",
      name: "DSLR Camera Kit",
      description: "Camera body, two lenses, tripod and lighting. Signed out at the store desk.",
      capacity: 1,
      requiresApproval: true,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 480,
      amenities: ["Tripod", "Lighting"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-van",
      typeId: "typ-vehicle",
      locationId: "loc-park",
      name: "Toyota Van NB-4512",
      description: "Eight-seat van for site visits. Keys at reception; log the odometer on return.",
      capacity: 8,
      requiresApproval: true,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 600,
      openMinute: 6 * 60,
      closeMinute: 20 * 60,
      openDays: EVERY_DAY,
      amenities: ["8 seats", "Roof rack"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-car",
      typeId: "typ-vehicle",
      locationId: "loc-park",
      name: "Suzuki Alto CAB-7781",
      description: "Small car for short city trips.",
      capacity: 4,
      requiresApproval: true,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 600,
      openMinute: 6 * 60,
      closeMinute: 20 * 60,
      openDays: EVERY_DAY,
      amenities: ["4 seats"],
      managedBy: "usr-nimal",
    },
    {
      ...baseRoom,
      id: "res-laptop",
      typeId: "typ-equip",
      locationId: "loc-store",
      name: "Loan Laptop L-07",
      description: "Spare laptop for visitors and interviews.",
      capacity: 1,
      requiresCheckIn: false,
      slotMinutes: 60,
      maxMinutes: 480,
      amenities: ["Windows", "Docking station"],
      managedBy: "usr-nimal",
    },
  ];

  const series: RecurrenceSeries[] = [
    { id: "ser-design", rule: "weekly", until: at(day(45), "23:59"), createdBy: "usr-vi" },
  ];

  let code = 2037;
  const nextCode = () => `RSV-${++code}`;

  // A request is always asked for before it starts, and never in the future:
  // the approvals queue sorts by age and prints it, so this has to be honest.
  let askedSequence = 0;
  const askedAt = (dayISO: string): Date => {
    const planned = at(addDaysISO(dayISO, -3), "10:15");
    if (planned < now) return planned;
    askedSequence += 1;
    return new Date(now.getTime() - askedSequence * 55 * 60 * 1000);
  };

  const reservation = (input: {
    id: string;
    resourceId: string;
    userId: string;
    title: string;
    attendees: number;
    dayISO: string;
    from: string;
    to: string;
    status: Reservation["status"];
    seriesId?: string | null;
    checkedIn?: boolean;
    decidedBy?: string | null;
    decisionNote?: string | null;
    cancelReason?: string | null;
  }): Reservation => {
    const startsAt = at(input.dayISO, input.from);
    const endsAt = at(input.dayISO, input.to);
    const asked = askedAt(input.dayISO);
    const decided = input.status === "confirmed" || input.status === "rejected" || input.status === "completed";
    return {
      id: input.id,
      code: nextCode(),
      resourceId: input.resourceId,
      userId: input.userId,
      seriesId: input.seriesId ?? null,
      title: input.title,
      attendees: input.attendees,
      startsAt,
      endsAt,
      status: input.status,
      decidedBy: input.decidedBy ?? null,
      decidedAt: decided && input.decidedBy ? at(input.dayISO, "08:00") : null,
      decisionNote: input.decisionNote ?? null,
      checkedInAt: input.checkedIn ? startsAt : null,
      cancelledAt: input.status === "cancelled" ? at(input.dayISO, "07:30") : null,
      cancelReason: input.cancelReason ?? null,
      createdAt: asked,
      updatedAt: asked,
    };
  };

  /**
   * Four weeks of history, so the reports have something real to measure.
   * It is generated from a fixed table rather than at random, so every run
   * produces the same numbers and a demo is repeatable.
   */
  const HISTORY_PATTERN: Array<{ resourceId: string; userId: string; title: string; from: string; to: string; weekdays: number[] }> = [
    // Board Room A is the room everyone wants; the reports should show that.
    { resourceId: "res-board-a", userId: "usr-kasun", title: "Finance sync", from: "09:00", to: "10:30", weekdays: [1, 3] },
    { resourceId: "res-board-a", userId: "usr-ruwan", title: "Sprint planning", from: "09:00", to: "11:00", weekdays: [2, 4] },
    { resourceId: "res-board-a", userId: "usr-vi", title: "Design review", from: "11:00", to: "12:00", weekdays: [1, 2, 3, 4, 5] },
    { resourceId: "res-board-a", userId: "usr-kavindi", title: "Client meeting", from: "14:00", to: "16:00", weekdays: [2, 4] },
    { resourceId: "res-board-a", userId: "usr-aqsa", title: "Supplier review", from: "14:00", to: "15:30", weekdays: [1, 3, 5] },
    { resourceId: "res-board-a", userId: "usr-vi", title: "Interview panel", from: "16:00", to: "17:30", weekdays: [1, 3] },

    { resourceId: "res-board-b", userId: "usr-kavindi", title: "Marketing sync", from: "10:00", to: "11:00", weekdays: [1, 4] },
    { resourceId: "res-board-b", userId: "usr-kasun", title: "Budget review", from: "13:00", to: "15:00", weekdays: [3] },

    { resourceId: "res-huddle-3", userId: "usr-ruwan", title: "Stand-up", from: "09:30", to: "10:00", weekdays: [1, 2, 3, 4, 5] },
    { resourceId: "res-huddle-3", userId: "usr-aqsa", title: "Vendor call", from: "11:00", to: "12:00", weekdays: [2, 5] },
    { resourceId: "res-huddle-3", userId: "usr-vi", title: "1:1", from: "13:00", to: "13:30", weekdays: [1, 2, 3, 4, 5] },
    { resourceId: "res-huddle-3", userId: "usr-kavindi", title: "Copy review", from: "15:00", to: "16:00", weekdays: [2, 4] },
    { resourceId: "res-huddle-3", userId: "usr-ruwan", title: "Retro", from: "16:30", to: "17:30", weekdays: [5] },

    { resourceId: "res-huddle-4", userId: "usr-kavindi", title: "Content pairing", from: "10:00", to: "11:30", weekdays: [1, 4] },
    { resourceId: "res-huddle-4", userId: "usr-kasun", title: "Supplier call", from: "12:00", to: "13:00", weekdays: [2, 5] },
    { resourceId: "res-huddle-4", userId: "usr-ruwan", title: "Code review", from: "15:00", to: "16:00", weekdays: [1, 3, 5] },

    { resourceId: "res-training", userId: "usr-vi", title: "Workshop", from: "09:00", to: "13:00", weekdays: [3] },
    { resourceId: "res-training", userId: "usr-kavindi", title: "Onboarding", from: "09:00", to: "16:00", weekdays: [1] },

    { resourceId: "res-auditorium", userId: "usr-nimal", title: "All-hands", from: "14:00", to: "16:00", weekdays: [5] },

    { resourceId: "res-proj-1", userId: "usr-kavindi", title: "Presentation kit", from: "13:00", to: "17:00", weekdays: [2] },
    { resourceId: "res-proj-1", userId: "usr-vi", title: "Board pack", from: "09:00", to: "12:00", weekdays: [4] },
    { resourceId: "res-laptop", userId: "usr-kasun", title: "Visitor laptop", from: "09:00", to: "17:00", weekdays: [4] },
    { resourceId: "res-camera", userId: "usr-kavindi", title: "Product shoot", from: "10:00", to: "15:00", weekdays: [2] },

    { resourceId: "res-van", userId: "usr-aqsa", title: "Site visit", from: "08:00", to: "15:00", weekdays: [1, 5] },
    { resourceId: "res-van", userId: "usr-kasun", title: "Warehouse run", from: "08:00", to: "12:00", weekdays: [3] },
    { resourceId: "res-car", userId: "usr-ruwan", title: "Errands", from: "10:00", to: "12:00", weekdays: [3] },
    { resourceId: "res-car", userId: "usr-aqsa", title: "Client drop-in", from: "13:00", to: "16:00", weekdays: [2, 4] },
  ];

  const history: Reservation[] = [];
  let historyIndex = 0;

  for (let back = 20; back >= 1; back -= 1) {
    const dayISO = day(-back);
    const weekday = localWeekday(startOfLocalDay(dayISO));

    for (const slot of HISTORY_PATTERN) {
      if (!slot.weekdays.includes(weekday)) continue;
      historyIndex += 1;

      // A tenth of the room bookings are no-shows that the system released,
      // and roughly one in twelve is cancelled by the person who booked it.
      const released = historyIndex % 10 === 0;
      const cancelled = !released && historyIndex % 12 === 0;

      history.push(
        reservation({
          id: `rsv-h${historyIndex}`,
          resourceId: slot.resourceId,
          userId: slot.userId,
          title: slot.title,
          attendees: 2,
          dayISO,
          from: slot.from,
          to: slot.to,
          status: released || cancelled ? "cancelled" : "completed",
          checkedIn: !released && !cancelled,
          decidedBy: slot.resourceId === "res-van" || slot.resourceId === "res-car" ? "usr-nimal" : null,
          cancelReason: released
            ? "Released automatically: nobody checked in within 15 minutes."
            : cancelled
              ? "No longer needed"
              : null,
        }),
      );
    }
  }

  const reservations: Reservation[] = [
    ...history,

    // One rejected request from last week, so the reports show every outcome.
    reservation({ id: "rsv-p10", resourceId: "res-auditorium", userId: "usr-kavindi", title: "Product launch rehearsal", attendees: 60, dayISO: day(-2), from: "13:00", to: "17:00", status: "rejected", decidedBy: "usr-nimal", decisionNote: "Hall was already set up for the AGM." }),

    // Today — these are the rows on the dashboard timeline.
    reservation({ id: "rsv-2038", resourceId: "res-board-a", userId: "usr-vi", title: "Design review", attendees: 6, dayISO: anchor, from: "11:00", to: "12:00", status: "confirmed", seriesId: "ser-design" }),
    reservation({ id: "rsv-2039", resourceId: "res-board-a", userId: "usr-kasun", title: "Finance sync", attendees: 5, dayISO: anchor, from: "09:00", to: "10:30", status: "confirmed" }),
    reservation({ id: "rsv-2040", resourceId: "res-board-a", userId: "usr-kavindi", title: "Interview panel", attendees: 4, dayISO: anchor, from: "14:00", to: "15:30", status: "pending" }),
    reservation({ id: "rsv-2041", resourceId: "res-huddle-3", userId: "usr-ruwan", title: "1:1 Ruwan", attendees: 2, dayISO: anchor, from: "08:30", to: "09:30", status: "confirmed" }),
    reservation({ id: "rsv-2042", resourceId: "res-huddle-3", userId: "usr-aqsa", title: "Vendor call", attendees: 3, dayISO: anchor, from: "11:00", to: "12:30", status: "confirmed" }),
    reservation({ id: "rsv-2043", resourceId: "res-huddle-3", userId: "usr-vi", title: "Retro", attendees: 4, dayISO: anchor, from: "16:00", to: "17:00", status: "confirmed" }),
    reservation({ id: "rsv-2044", resourceId: "res-huddle-4", userId: "usr-ruwan", title: "Pairing", attendees: 2, dayISO: anchor, from: "13:00", to: "14:00", status: "confirmed" }),
    reservation({ id: "rsv-2045", resourceId: "res-laptop", userId: "usr-kavindi", title: "Interview laptop", attendees: 1, dayISO: anchor, from: "09:00", to: "13:00", status: "confirmed" }),

    // The approvals queue.
    reservation({ id: "rsv-2047", resourceId: "res-van", userId: "usr-aqsa", title: "Site visit, Galle client", attendees: 5, dayISO: day(3), from: "08:00", to: "17:00", status: "pending" }),
    reservation({ id: "rsv-2048", resourceId: "res-camera", userId: "usr-kavindi", title: "Product photography", attendees: 1, dayISO: day(2), from: "09:00", to: "13:00", status: "pending" }),
    reservation({ id: "rsv-2049", resourceId: "res-auditorium", userId: "usr-nimal", title: "All-hands", attendees: 90, dayISO: day(4), from: "14:00", to: "17:00", status: "pending" }),
    reservation({ id: "rsv-2050", resourceId: "res-van", userId: "usr-kasun", title: "Supplier pickup", attendees: 2, dayISO: day(3), from: "13:00", to: "17:00", status: "pending" }),
    reservation({ id: "rsv-2051", resourceId: "res-car", userId: "usr-ruwan", title: "Bank and post office", attendees: 1, dayISO: day(1), from: "10:00", to: "12:00", status: "pending" }),

    // Later this week, confirmed.
    reservation({ id: "rsv-2052", resourceId: "res-board-a", userId: "usr-vi", title: "Design review", attendees: 6, dayISO: day(7), from: "11:00", to: "12:00", status: "confirmed", seriesId: "ser-design" }),
    reservation({ id: "rsv-2053", resourceId: "res-huddle-4", userId: "usr-vi", title: "Roadmap sync", attendees: 4, dayISO: day(2), from: "10:00", to: "11:00", status: "confirmed" }),
    reservation({ id: "rsv-2054", resourceId: "res-training", userId: "usr-kavindi", title: "Content workshop", attendees: 14, dayISO: day(4), from: "09:00", to: "12:00", status: "confirmed" }),
    reservation({ id: "rsv-2055", resourceId: "res-proj-1", userId: "usr-vi", title: "Board presentation", attendees: 1, dayISO: day(3), from: "09:00", to: "12:00", status: "confirmed" }),
  ];

  const blackouts: Blackout[] = [
    { id: "blk-proj2", resourceId: "res-proj-2", startsAt: at(anchor, "12:00"), endsAt: at(anchor, "18:00"), reason: "Lamp replacement", createdBy: "usr-nimal" },
    { id: "blk-boardb", resourceId: "res-board-b", startsAt: at(day(3), "08:00"), endsAt: at(day(3), "18:00"), reason: "Closed for painting", createdBy: "usr-nimal" },
  ];

  const notifications: Notification[] = [
    {
      id: "ntf-1",
      userId: "usr-vi",
      reservationId: "rsv-2038",
      kind: "reminder",
      title: "Design review starts soon",
      body: "Board Room A · check in to keep the room.",
      readAt: null,
      createdAt: at(anchor, "10:45"),
    },
    {
      id: "ntf-2",
      userId: "usr-vi",
      reservationId: "rsv-2047",
      kind: "pending",
      title: "Toyota Van NB-4512 needs your decision",
      body: "Aqsa Shaikh asked for the van for a site visit.",
      readAt: null,
      createdAt: at(day(-1), "16:20"),
    },
    {
      id: "ntf-3",
      userId: "usr-aqsa",
      reservationId: "rsv-2047",
      kind: "pending",
      title: "Your van request is waiting for approval",
      body: "We'll email you as soon as Facilities decides.",
      readAt: at(day(-1), "17:00"),
      createdAt: at(day(-1), "16:20"),
    },
  ];

  const audit: AuditLog[] = [
    {
      id: "aud-1",
      actorId: "usr-nimal",
      entity: "blackout",
      entityId: "blk-proj2",
      action: "blackout.create",
      diff: { resourceId: "res-proj-2", reason: "Lamp replacement" },
      createdAt: at(day(-1), "09:10"),
    },
  ];

  return {
    departments,
    users,
    resourceTypes,
    locations,
    resources,
    series,
    reservations,
    blackouts,
    notifications,
    audit,
    codeCounter: code,
  };
}
