# Reservo

A resource reservation system for an organisation that shares rooms, equipment
and vehicles. It replaces the chat messages and paper lists that were causing
overlaps, and answers the three questions that were being asked by hand:

1. **What is free, and when?** A catalogue and a day timeline that show free,
   booked, pending and maintenance time at a glance.
2. **Can two people book the same thing?** No. A live check while you type, and
   a database constraint that has the final say.
3. **How are the resources actually used?** Utilisation, busiest hours,
   no-shows and approval turnaround, so an admin knows what to add or retire.

Built for the PrimeWave Lab software engineering internship assessment.

---

## Two data adapters, one application

The domain services talk to a set of repository interfaces
([`lib/data/ports.ts`](lib/data/ports.ts)) and never to a database directly.
Two adapters implement them, and nothing above that boundary — no service, no
view model, no component — knows which one is running.

| `DATA_ADAPTER` | What it is | Setup |
| --- | --- | --- |
| `memory` (default) | A seeded in-memory store. Resets when the dev server restarts. | None |
| `postgres` | Supabase, over a direct Postgres connection. | `DATABASE_URL`, then migrate and seed |

Both honour the two things the database is really responsible for:

- **`createGuarded` / `rescheduleGuarded`** refuse to write a slot that is
  already taken. The in-memory adapter serialises the check per resource; the
  Postgres adapter attempts the insert and catches the exclusion-constraint
  violation (`23P01`), which is the real guarantee.
- **`runInTransaction`** brackets a write and its audit row. In memory it just
  runs the callback; in Postgres it opens a transaction, carried to the
  repositories through `AsyncLocalStorage` so the port signature stays
  argument-free.

The schema, with its constraints and indexes and the reasoning behind them, is
in [`docs/erd.md`](docs/erd.md), and in runnable form in
[`supabase/migrations/`](supabase/migrations).

---

## Running it

Requires Node 20.9+ (developed on Node 24).

```bash
npm install
cp .env.example .env.local
# Fill in the three Supabase values in .env.local before signing in — see below.
npm run dev
```

Open <http://localhost:3000>. The in-memory adapter serves all the *data* with
no database, and the seed is built relative to today, so the dashboard,
schedule and approvals queue always have live-looking data.

**Sign-in is not local, though.** It goes through Supabase Auth, so
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` are needed even on the memory adapter. This is the
price of moving auth to Supabase: the project no longer runs end to end with
zero configuration.

To run the data against Supabase too, see [Running on
Supabase](#running-on-supabase).

### Signing in

| Account | Role | Password |
| --- | --- | --- |
| `admin@reservo.test` | Admin (Vishwaka Bandara) | `reservo123` |
| `member@reservo.test` | Member (Aqsa Shaikh) | `reservo123` |

Both are pre-filled on the sign-in form. Other seeded people —
`nimal@`, `kavindi@`, `kasun@`, `ruwan@reservo.test` — share the password.

These are *profiles*. Since sign-in moved to Supabase Auth, each also needs an
**identity** in your Supabase project before it can be used:

- On the `postgres` adapter, `npm run db:seed` creates every identity, confirms
  it and sets the password above. Nothing to do.
- On the `memory` adapter, run `npm run auth:seed`. It creates the identities
  and nothing else, which is the piece `db:seed` cannot do without a database.
  It needs `SUPABASE_SERVICE_ROLE_KEY`, and it is idempotent.

The profile and the identity are joined on email at first sign-in, and the link
is stored in `users.auth_user_id` from then on.

### Registering

`/sign-up` takes a name, a work email and a password. It creates the Supabase
identity and a profile that is **inactive**, so registering queues a request
rather than granting access — nobody books a room by signing themselves up. An
admin turns the account on from **Admin → Users**, which is the Activate
control that was already there.

The confirmation link in Supabase's email comes back to `/auth/confirm`, which
verifies the token, discards the session it creates (the account is not
approved yet, and a valid token for an account the app refuses is a confusing
state to leave someone in) and returns to sign-in with a note.

For the link to arrive at the right host, add `<your origin>/auth/confirm` to
**Authentication → URL Configuration → Redirect URLs** in Supabase. Without it
Supabase falls back to the project's Site URL.

The form answers the same way whether or not the address is already known —
same wording, and an address that already has a profile is left untouched — so
it cannot be used to find out who has an account.

### Other commands

```bash
npm test          # 34 tests covering the booking rules
npm run typecheck # tsc --noEmit
npm run lint
npm run build
npm run auth:seed # create the demo accounts' Supabase identities

npm run db:migrate  # apply supabase/migrations to the database
npm run db:seed     # load the demo data into it
```

To start a demo from clean data without restarting the server (in-memory
adapter only):

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

---

## What it does

### For everyone

- **Dashboard** — the next booking with a check-in button, two dials (your
  month, today's utilisation), today's timeline, what is free right now, and
  this week's maintenance notices.
- **Schedule** — the shared day, filtered by type and location. Clicking an
  empty lane starts a reservation on that resource; clicking a booking opens
  its detail panel.
- **Browse resources** — ask for a time, get cards that say whether each
  resource is free *for that time*, with a day bar and the next free slot.
- **Resource detail** — specs, booking rules, 30-day usage, the week's
  availability, and a slot grid for one-tap booking.
- **New reservation** — the live conflict check. See below.
- **My reservations** — upcoming, pending, past and cancelled, with cancel,
  edit and check-in.
- **Activity log** — what you changed, and when.

### For admins, as well

- **Approvals** — the queue for resources that need sign-off, oldest first,
  with the requester's recent usage and a warning when another request wants
  the same slot.
- **Manage resources** — add resources, set their rules, block maintenance
  time, retire them.
- **Users & roles** — invite, promote, deactivate, and the permission matrix.
- **Usage reports** — utilisation by resource, a busiest-hours heatmap,
  outcomes, usage by team, approval turnaround, CSV export.

---

## The parts worth explaining

### Double-booking is prevented twice, on purpose

The booking form asks the BFF for availability as you type (debounced, and an
aborted request never overwrites a newer answer). A clash shows the name and
time of the booking in the way, plus the nearest free times and similar free
resources as one-tap chips. `Reserve` stays disabled while the clash stands.

That check can always be raced — two people can pass it in the same
millisecond — so it is a courtesy, not the guarantee. The write itself is the
guarantee: `createGuarded` refuses a slot that is taken, and in Postgres that
is an `EXCLUDE USING gist` constraint on
`tstzrange(starts_at, ends_at, '[)')`. There is a test that fires two identical
bookings concurrently and asserts exactly one wins.

The range is half-open: a booking ending at 11:00 and one starting at 11:00 do
not clash, because back-to-back meetings are the normal case.

### A pending request is a bid, not a hold

The one place where I deliberately departed from the supplied design, which
contradicts itself here: its ER diagram puts `pending` inside the no-overlap
constraint, while its approvals screen shows two overlapping pending requests
for the same van and promises that approving one rejects the other.

Both cannot be true. If a pending request locked the slot, the second person
could never ask, and the approvals screen's central feature would be dead code.
So only `confirmed` reservations own a slot. Pending requests still appear on
the timeline, dashed, so the competition is visible, and the booking form says
who else has asked. Approval is the moment the slot is claimed, so
`approveReservation` re-checks for a confirmed clash before confirming, and
auto-rejects the other requests with a reason sent to each person.

### Rooms release themselves

A room that needs check-in and that nobody claims within 15 minutes is
released, the slot goes back to the pool, and the person is told. That fixes
"booked but empty", which is the complaint that usually follows a booking
system.

There is no scheduler yet, so the sweep (`settleOverdue`) runs at the start of
every BFF read. It is idempotent, which is what makes that safe. Moving it to a
cron job once the database is in place is a one-line change.

### Changing a rule never cancels a booking silently

Editing a resource's hours or capacity reports the future reservations that no
longer fit and leaves them alone — the admin decides. Blocking maintenance time
*does* cancel the bookings inside the window, because the resource genuinely
will not be available, and everyone affected is told why.

### Times

Every instant is stored in UTC and displayed in the organisation's timezone
(`ORG_TIME_ZONE`, default `Asia/Colombo`). All of that conversion lives in
[`lib/domain/time.ts`](lib/domain/time.ts) so the rest of the app never does
ad-hoc date arithmetic, which is where booking bugs usually come from. Bookable
hours are stored as minutes from local midnight rather than as times, so a
window is integer arithmetic and never ambiguous across a DST change.

---

## Architecture: a backend-for-frontend

```
  Browser
    │
    │  one request per screen
    ▼
┌─────────────────────────────────────────────────────────┐
│  BFF — Next.js App Router server                        │
│                                                          │
│  app/(app)/**           pages, render only               │
│  lib/bff/views/*        one view model per screen        │
│  lib/bff/actions.ts     server actions (every write)     │
│  lib/bff/schemas.ts     Zod, validates every input       │
│  lib/auth/session.ts    session + requireUser/requireAdmin│
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  Domain services — lib/server/*                          │
│  availability · reservations · approvals · resources     │
│  users · reports                                         │
└─────────────────────────────────────────────────────────┘
    │  repository ports (lib/data/ports.ts)
    ▼
┌─────────────────────────────────────────────────────────┐
│  Data adapter — in-memory today, PostgreSQL last         │
└─────────────────────────────────────────────────────────┘
```

**Thin UI.** Components render; they never format a time, decide a permission
or aggregate anything. A reservation becomes a display row in exactly one
place, `toReservationRow`, so a time looks the same on every screen.

**One view model per screen.** The dashboard needs five queries; the browser
makes one request. Each builder in `lib/bff/views/` returns data already shaped
for the components — `Gauge` segments, timeline rows in decimal hours, badge
status keys, formatted times.

**Server components call the builders directly.** A page render is already one
request from the browser, so having it fetch the app's own route handler over
HTTP would add a round trip and buy nothing. The route handlers under
`app/api/bff/` expose the *same builders* for callers that are not this render:
the live availability check the booking form polls, the CSV export, and anyone
who wants the view model as JSON. One definition, two entry points.

| Screen | Read | Write |
| --- | --- | --- |
| Dashboard | `GET /api/bff/dashboard` | — |
| Schedule | `GET /api/bff/schedule?date&type&location` | — |
| Browse resources | `GET /api/bff/resources?date&from&to&type&minCapacity` | — |
| Resource detail | `GET /api/bff/resources/:id?week` | — |
| New reservation | `GET /api/bff/availability` | `createReservationAction`, `editReservationAction` |
| My reservations | `GET /api/bff/me/reservations?tab&cursor` | `cancelReservationAction`, `checkInAction` |
| Approvals | `GET /api/bff/admin/approvals` | `approveAction`, `rejectAction` |
| Manage resources | `GET /api/bff/admin/resources` | `upsertResourceAction`, `blockTimeAction`, `retireResourceAction` |
| Reports | `GET /api/bff/admin/reports?range` | `GET /api/bff/admin/reports/export` (CSV) |
| Users & roles | `GET /api/bff/admin/users` | `inviteUserAction`, `setRoleAction`, `setActiveAction` |

**Every write does the same four things, in the same order**: identify the
caller and check the role, validate with Zod, call a domain service that writes
in a transaction with an audit row, then revalidate the affected screens.

### Permissions

Two roles. A member books, edits and cancels their own reservations, checks in,
and reads the shared schedule. An admin does all that plus approvals, the
catalogue, maintenance blocks, users and reports.

Enforcement is in three places and only one of them matters:

- `proxy.ts` refreshes the Supabase session and redirects a request that has
  none. The redirect is a convenience: Next's own docs warn that a matcher
  change can silently remove proxy coverage, so nothing trusts it.
- The sidebar is built from the role, so a member never receives admin links,
  and `app/(app)/admin/layout.tsx` sends them to an explanation if they follow
  a stale one.
- **`requireUser()` / `requireAdmin()` run inside every BFF route handler and
  every server action.** Hiding a button is never the only check. Calling
  `/api/bff/admin/approvals` as a member returns `403`.

The role is read from the store on every request rather than carried in the
token, so changing someone's role takes effect immediately.

### Authentication

Supabase Auth holds the credential and the tokens. `signInWithPassword` issues
them, `@supabase/ssr` keeps them in cookies, and `proxy.ts` rotates them —
a server component cannot write a cookie, so something that can has to.

What Supabase does *not* hold is the role. A signed-in request resolves in two
steps: Supabase says which identity is calling, and this application's `users`
table says what that identity may do. That is why a demotion is immediate
rather than waiting for an access token to expire.

The two are joined by `users.auth_user_id` (migration `0002`). A profile
created before its identity — an invited colleague, a freshly seeded database —
is matched on email at first sign-in and the link is written then. A profile
already bound to a different identity is refused rather than matched, so
registering a second account with someone's address cannot borrow their role.
An identity with no profile is refused too, and its session discarded.

`getSession()` calls `auth.getUser()`, which revalidates the token with
Supabase instead of trusting the cookie. That is a network call per request:
`auth.getClaims()` verifies locally against the project's JWKS and would remove
it, which is the first thing to reach for if this shows up in latency.

Creating an account *for someone else* needs the service-role key, so
`inviteUser` goes through `utils/supabase/admin.ts`. It creates the identity
before the profile: an unused identity is recoverable, whereas a profile that
can never sign in looks like a working user.

Self-registration does not need that key — `signUp` acts as the visitor, with
the publishable key — but it only ever produces an inactive profile. See
[Registering](#registering).

---

## Design system

The UI is a port of the supplied Reservo design system, kept faithful rather
than reinterpreted:

- **Tokens** (`styles/tokens.css`) — colours, type scale, spacing, radii,
  shadows and sizes, with a full dark theme. Nothing in the app hard-codes a
  colour.
- **Components** (`components/ui/`) — the 18 components and the 36-icon set,
  ported to typed React: `Button`, `Badge`, `Field`, `Card`, `Gauge`,
  `AvailabilityTimeline`, `Alert`, `DataTable`, `EmptyState` and the rest.
- **Rules carried over** — availability is drawn, not listed; status is always
  a word plus a colour; one primary action per view; 24-hour times in a
  monospace face so columns line up; sentence case; no emoji.

Accessibility came along with it: real `<button>`, `<a href>` and
`<label>` elements, a visible 2px focus ring on every control, `aria-current`
on the active nav item, `aria-label` on icon-only buttons, and status conveyed
by text as well as colour.

Responsive, per the design: a 248px sidebar above 1200px, a 72px icon rail
below it, and a bottom tab bar with 48px controls below 768px.

---

## Layout

```
app/
  (app)/                  signed-in shell: sidebar, top bar, tab bar
    dashboard/  schedule/  resources/[id]/  reservations/new/
    admin/      approvals/ resources/ users/ reports/
    activity/   no-access/
  api/bff/                route handlers — the same view models as JSON
  api/dev/reset/          development only: reseed
  sign-in/
components/
  ui/                     the Reservo design system, ported
  shell/                  app shell and page header
  screens/                the client components that hold form state
lib/
  domain/                 entities and all time handling
  data/
    ports.ts              the interfaces both adapters implement
    memory/               in-memory adapter + the seed
    postgres/             Supabase adapter: connection, transactions, queries
  server/                 domain services — the rules live here
  bff/                    view models, server actions, Zod schemas
  auth/                   session: Supabase identity -> app profile + role
supabase/migrations/      the schema, as runnable SQL
scripts/                  db:migrate and db:seed
utils/supabase/           Supabase clients: browser, server, and service-role
tests/                    the booking rules
docs/erd.md               the schema, explained
```

---

## Tests

`npm test` — 34 tests, no database needed. They cover the things that would
actually hurt if they broke:

- half-open overlap in every arrangement, and local-time round-tripping;
- confirmed straight away vs. waiting for approval;
- an overlapping booking refused, with suggestions offered;
- back-to-back bookings allowed;
- **two concurrent bookings for the same slot: exactly one wins**;
- a weekly repeat skipping the dates already taken;
- every booking rule: outside hours, closed day, too long, off-slot, over
  capacity, in the past;
- two people bidding for the same van, and approval auto-rejecting the loser;
- approval refused when the slot was confirmed in the meantime;
- rejection requiring a reason; a request decided only once;
- cancelling freeing the slot; a member not cancelling someone else's booking;
- check-in refused before its window and accepted inside it;
- a no-show released, and a checked-in booking left alone;
- maintenance cancelling the bookings inside the window.

---

## Running on Supabase

The Supabase project is a plain PostgreSQL database here. The app connects to
it directly rather than through the REST API, because the REST API cannot open
a transaction or surface the exclusion-constraint violation the booking guard
depends on.

**1. Set the connection string.** In the Supabase dashboard, Project Settings →
Database → Connection string → the pooled one (port 6543). Put it in
`.env.local` along with the adapter switch:

```bash
DATA_ADAPTER=postgres
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

**2. Create the schema.**

```bash
npm run db:migrate
```

This applies every file in `supabase/migrations/` in order, each inside a
transaction, and records what it has applied in `schema_migrations`, so running
it again is a no-op. The same SQL can be pasted into the Supabase SQL editor if
you would rather watch it run.

**3. Load the demo data.**

```bash
npm run db:seed
```

This reuses `buildSeed()` — the same data the in-memory adapter starts from, so
both adapters show the same application and there is one place to change it.
The seed's readable ids (`res-board-a`) are hashed into stable uuids on the way
in. It clears the tables first, so it is repeatable.

**4. Run it.** `npm run dev`, and sign in with the same demo accounts.

### A note on security

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ships to the browser, so every table has
row-level security enabled **with no policies**. PostgREST therefore exposes
nothing at all: that key cannot read a single row. The application connects as
the table owner over Postgres, where RLS does not apply, and does its own
permission checks in `requireUser()` / `requireAdmin()`.

If any data is ever opened up to the browser, add policies in a migration —
never by turning RLS off.

### Why a SQL driver and not an ORM

[`postgres`](https://github.com/porsager/postgres) rather than Prisma, for
three reasons. The constraint that makes this product work — `EXCLUDE USING
gist` — cannot be expressed in a Prisma schema, so the migration would be raw
SQL regardless, and the schema would then exist in two places that can drift.
Catching `23P01` and turning it into a readable conflict is the whole point of
the write path, and that is plainer with the driver. And Supabase's transaction
pooler needs `prepare: false`, which is one option here rather than a Prisma
workaround.

---

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ORG_TIME_ZONE` | `Asia/Colombo` | The timezone times are displayed in. |
| `DATA_ADAPTER` | `memory` | `memory` or `postgres`. Chooses the data path only — sign-in uses Supabase Auth either way. |
| `DATABASE_URL` | — | Pooled Supabase connection string. Required by the `postgres` adapter, by `db:migrate` and by `db:seed`. |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Supabase project URL. **Required** — sign-in goes through Supabase Auth. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | Public key, safe in the browser. RLS denies it everything. **Required** for sign-in. |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Service-role key. Needed to create an invited user's sign-in and to run `db:seed`. Bypasses RLS — never expose it to the browser. |

`SESSION_SECRET` is gone: there is no longer an application-signed cookie to
sign. Supabase issues and verifies the tokens.

`.env.example` has the shape of each; real values go in `.env.local`, which is
not committed.

---

## Deliberately left out

Calendar sync (Google, Outlook), SSO, waitlists, QR check-in at the door,
multiple organisations in one deployment, and a native mobile app — responsive
web covers phones. Each is a reasonable next step; none is needed to solve the
problem as stated, and the brief asks for a focused exercise rather than a
platform.
