-- Reservo — initial schema
--
-- Run this once against the Supabase project, either in the SQL editor
-- (Dashboard > SQL Editor > New query) or with `supabase db push`.
--
-- It is the schema documented in docs/erd.md, and it is the authority on two
-- rules the application depends on:
--   * a confirmed reservation cannot overlap another on the same resource, and
--   * a reservation cannot end before it starts.
--
-- Everything is created in the `public` schema. Supabase's own `auth.users`
-- table is left alone: this application manages its own accounts, because it
-- needs a `role` column and a password it controls.

begin;

-- Needed so an exclusion constraint can mix an equality test on resource_id
-- with an overlap test on a time range.
create extension if not exists btree_gist;

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

create table departments (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  password_hash text not null,
  role          text not null default 'member' check (role in ('admin', 'member')),
  department_id uuid references departments (id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Email is a natural key, and case must not create a second account.
create unique index users_email_lower on users (lower(email));
create index users_active_role on users (role) where is_active;

create table resource_types (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null
);

create table locations (
  id       uuid primary key default gen_random_uuid(),
  building text not null,
  floor    text,
  name     text not null
);

/* ------------------------------------------------------------------ *
 * Resources
 * ------------------------------------------------------------------ */

create table resources (
  id                uuid primary key default gen_random_uuid(),
  type_id           uuid not null references resource_types (id) on delete restrict,
  location_id       uuid not null references locations (id) on delete restrict,
  name              text not null,
  description       text not null default '',
  capacity          integer not null check (capacity > 0),
  requires_approval boolean not null default false,
  requires_check_in boolean not null default false,
  slot_minutes      integer not null check (slot_minutes between 5 and 240),
  max_minutes       integer not null check (max_minutes >= slot_minutes),

  -- Minutes from local midnight rather than a time, so a bookable window is
  -- integer arithmetic and never ambiguous across a DST change.
  open_minute  integer not null check (open_minute between 0 and 1440),
  close_minute integer not null check (close_minute between 0 and 1440),

  -- Days the resource can be booked, 0 = Sunday.
  open_days       integer[] not null default '{1,2,3,4,5}',
  book_ahead_days integer not null default 60 check (book_ahead_days > 0),
  status          text not null default 'active' check (status in ('active', 'maintenance', 'retired')),
  amenities       text[] not null default '{}',
  managed_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint resources_window_ordered check (close_minute > open_minute),
  constraint resources_max_is_whole_slots check (max_minutes % slot_minutes = 0)
);

create index resources_type on resources (type_id);
create index resources_location on resources (location_id);
create index resources_bookable on resources (status) where status = 'active';

/* ------------------------------------------------------------------ *
 * Reservations
 * ------------------------------------------------------------------ */

create table recurrence_series (
  id         uuid primary key default gen_random_uuid(),
  rule       text not null check (rule in ('weekly', 'weekdays')),
  until      timestamptz not null,
  created_by uuid not null references users (id) on delete cascade
);

-- Reservation codes are a short reference people can say out loud, kept
-- separate from the surrogate key. Starts where the seeded data leaves off.
create sequence reservation_code_seq start with 2100;

create table reservations (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique default ('RSV-' || nextval('reservation_code_seq')),
  resource_id uuid not null references resources (id) on delete restrict,
  user_id     uuid not null references users (id) on delete restrict,
  series_id   uuid references recurrence_series (id) on delete set null,
  title       text not null,
  attendees   integer not null default 1 check (attendees > 0),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')),

  decided_by    uuid references users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  checked_in_at timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint reservations_end_after_start check (ends_at > starts_at)
);

-- The guarantee the product rests on. The application checks for a clash
-- before it writes so people get a readable explanation and alternatives, but
-- that check can be raced; this is what makes double-booking impossible.
--
-- The range is half-open: a booking ending at 11:00 and one starting at 11:00
-- do not clash, because back-to-back meetings are the normal case.
--
-- It covers 'confirmed' only. A pending request is a bid, not a hold: the
-- resources that need approval are exactly the ones several people want at
-- once, and the admin's job is to choose between the requests. See
-- docs/erd.md for the reasoning.
alter table reservations
  add constraint reservations_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'confirmed');

create index reservations_resource_time
  on reservations using gist (resource_id, tstzrange(starts_at, ends_at, '[)'));
create index reservations_user_status_start on reservations (user_id, status, starts_at desc);
create index reservations_pending on reservations (created_at) where status = 'pending';
create index reservations_series on reservations (series_id) where series_id is not null;

/* ------------------------------------------------------------------ *
 * Maintenance, notifications, audit
 * ------------------------------------------------------------------ */

create table blackouts (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text not null,
  created_by  uuid not null references users (id) on delete restrict,

  constraint blackouts_end_after_start check (ends_at > starts_at)
);

create index blackouts_resource_time
  on blackouts using gist (resource_id, tstzrange(starts_at, ends_at, '[)'));

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  reservation_id uuid references reservations (id) on delete cascade,
  kind           text not null,
  title          text not null,
  body           text not null default '',
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index notifications_user_unread
  on notifications (user_id, created_at desc) where read_at is null;

create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  -- Null when the system itself acted, such as releasing a no-show.
  actor_id   uuid references users (id) on delete set null,
  entity     text not null check (entity in ('reservation', 'resource', 'user', 'blackout')),
  entity_id  uuid not null,
  action     text not null,
  diff       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_entity on audit_logs (entity, entity_id, created_at desc);
create index audit_logs_recent on audit_logs (created_at desc);

/* ------------------------------------------------------------------ *
 * Keep updated_at honest
 * ------------------------------------------------------------------ */

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger reservations_set_updated_at
  before update on reservations
  for each row execute function set_updated_at();

/* ------------------------------------------------------------------ *
 * Row-level security
 *
 * The publishable key ships to the browser, so PostgREST must expose nothing.
 * RLS is enabled on every table with no policies, which denies all access
 * through the API. The application connects as the table owner over a direct
 * Postgres connection, where RLS does not apply, and does its own permission
 * checks in requireUser() / requireAdmin().
 *
 * If parts of the data are ever opened to the browser, add policies here —
 * never by turning RLS off.
 * ------------------------------------------------------------------ */

alter table departments       enable row level security;
alter table users             enable row level security;
alter table resource_types    enable row level security;
alter table locations         enable row level security;
alter table resources         enable row level security;
alter table recurrence_series enable row level security;
alter table reservations      enable row level security;
alter table blackouts         enable row level security;
alter table notifications     enable row level security;
alter table audit_logs        enable row level security;

commit;
