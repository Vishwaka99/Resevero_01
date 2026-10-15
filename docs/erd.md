# Reservo — entity relationship diagram

The PostgreSQL schema behind the screens. It is written down now because the
whole application is built against it: the domain types in
[`lib/domain/types.ts`](../lib/domain/types.ts) are one-to-one with these
tables, and the repository ports in [`lib/data/ports.ts`](../lib/data/ports.ts)
describe exactly the queries it has to serve.

This schema is live in Supabase. `supabase/migrations/` builds exactly what is
drawn below — `0001_initial_schema.sql` creates it and `0002_supabase_auth.sql`
links it to Supabase Auth — and `npm run db:migrate` applies them. The app can
also run on an in-memory adapter that implements the same ports; see
[Running on Supabase](../README.md#running-on-supabase) in the README.

One table is not ours: `auth.users` belongs to Supabase Auth and holds the
credential. `users` here is the profile, and it is the profile that carries
the role — which is why a demotion takes effect on the next request rather
than when a token expires. The two are joined by `users.auth_user_id`.

All instants are `timestamptz`, stored in UTC and displayed in the
organisation's timezone (`ORG_TIME_ZONE`, default `Asia/Colombo`).

```mermaid
erDiagram
    auth_users ||--o| users : "signs in as"
    departments ||--o{ users : "has"
    users ||--o{ reservations : "books"
    users ||--o{ notifications : "receives"
    users ||--o{ audit_logs : "acts in"
    users ||--o{ blackouts : "schedules"
    users ||--o{ recurrence_series : "creates"
    users ||--o{ resources : "manages"

    resource_types ||--o{ resources : "classifies"
    locations ||--o{ resources : "houses"

    resources ||--o{ reservations : "is booked as"
    resources ||--o{ blackouts : "is closed by"

    recurrence_series ||--o{ reservations : "repeats as"
    reservations ||--o{ notifications : "triggers"

    auth_users {
        uuid id PK "auth.users — Supabase Auth owns this"
        text email
        text encrypted_password
    }

    departments {
        uuid id PK
        text name UK
    }

    users {
        uuid id PK
        text name
        citext email UK
        uuid auth_user_id FK UK "null until first sign-in"
        text password_hash "unused since 0002, kept nullable"
        text role "admin | member"
        uuid department_id FK "null"
        boolean is_active
        timestamptz created_at
    }

    resource_types {
        uuid id PK
        text name UK "Room | Equipment | Vehicle"
        text icon
    }

    locations {
        uuid id PK
        text building
        text floor "null"
        text name
    }

    resources {
        uuid id PK
        uuid type_id FK
        uuid location_id FK
        text name
        text description
        int capacity
        boolean requires_approval
        boolean requires_check_in
        int slot_minutes
        int max_minutes
        int open_minute "minutes from local midnight"
        int close_minute
        int_array open_days "0=Sun .. 6=Sat"
        int book_ahead_days
        text status "active | maintenance | retired"
        text_array amenities
        uuid managed_by FK "null"
        timestamptz created_at
    }

    recurrence_series {
        uuid id PK
        text rule "weekly | weekdays"
        timestamptz until
        uuid created_by FK
    }

    reservations {
        uuid id PK
        text code UK "RSV-2041"
        uuid resource_id FK
        uuid user_id FK
        uuid series_id FK "null"
        text title
        int attendees
        timestamptz starts_at
        timestamptz ends_at
        text status "pending | confirmed | rejected | cancelled | completed"
        uuid decided_by FK "null"
        timestamptz decided_at "null"
        text decision_note "null"
        timestamptz checked_in_at "null"
        timestamptz cancelled_at "null"
        text cancel_reason "null"
        timestamptz created_at
        timestamptz updated_at
    }

    blackouts {
        uuid id PK
        uuid resource_id FK
        timestamptz starts_at
        timestamptz ends_at
        text reason
        uuid created_by FK
    }

    notifications {
        uuid id PK
        uuid user_id FK
        uuid reservation_id FK "null"
        text kind
        text title
        text body
        timestamptz read_at "null"
        timestamptz created_at
    }

    audit_logs {
        uuid id PK
        uuid actor_id FK "null when the system acted"
        text entity "reservation | resource | user | blackout"
        uuid entity_id
        text action
        jsonb diff
        timestamptz created_at
    }
```

## Why double-booking cannot happen

The application checks for a clash before it writes, so people get a readable
explanation and suggested alternatives rather than a failed request. That check
can always be raced, so the database has the final say:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status = 'confirmed');

ALTER TABLE reservations
  ADD CONSTRAINT reservations_end_after_start CHECK (ends_at > starts_at);
```

Two points worth stating plainly, because they are judgement calls:

**The range is half-open, `'[)'`.** A booking that ends at 11:00 and one that
starts at 11:00 do not clash. Back-to-back meetings are the normal case, and a
closed range would reject them.

**The constraint covers `confirmed` only, not `pending`.** A pending request is
a bid, not a hold. The resources that need approval — the vans, the auditorium
— are exactly the ones several people want at once, and the admin's job is to
choose between the requests: approving one rejects the others automatically and
tells those people why. If a pending request locked the slot, the first person
to ask would silently win and nobody else could even put their case.

Pending requests are still drawn on the timeline, dashed, so the competition is
visible, and the booking form says who else has asked. Approval is the moment
the slot is actually claimed, so `ApprovalService.approve` re-checks for a
confirmed clash before it confirms — and the constraint above backs that check
up.

## Indexes the queries need

```sql
-- The timeline and every availability check: one resource over a date range.
CREATE INDEX reservations_resource_time
  ON reservations USING gist (resource_id, tstzrange(starts_at, ends_at, '[)'));

-- "My reservations", split by tab.
CREATE INDEX reservations_user_status_start ON reservations (user_id, status, starts_at DESC);

-- The approvals queue, oldest first.
CREATE INDEX reservations_pending ON reservations (created_at) WHERE status = 'pending';

-- Maintenance windows over a date range.
CREATE INDEX blackouts_resource_time
  ON blackouts USING gist (resource_id, tstzrange(starts_at, ends_at, '[)'));

-- The notification bell.
CREATE INDEX notifications_user_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

-- The activity log.
CREATE INDEX audit_logs_entity ON audit_logs (entity, entity_id, created_at DESC);
```

## Notes on a few columns

**`users.auth_user_id`** points at `auth.users(id)`, `on delete set null`. Null
means a profile that has never been matched to an identity — one seeded ahead
of its account, or created by an admin before the person first signs in; the
two are matched on email at that point and the link written then. Deleting the
identity leaves the profile and everything it owns intact, and only takes away
the ability to sign in. `password_hash` is what Supabase Auth replaced: nothing
reads or writes it now, and it stays nullable so a database can be rolled back
to the cookie session without having lost its hashes.

| Column | Why it exists |
| --- | --- |
| `reservations.code` | A short reference people can say out loud and search for, separate from the surrogate key. |
| `reservations.series_id` | A weekly repeat is a set of independent rows that share a series. Cancelling one occurrence leaves the rest alone, which is what people expect. |
| `resources.open_minute` / `close_minute` | Minutes from local midnight rather than a time, so a bookable window is simple integer arithmetic and never ambiguous across a DST change. |
| `resources.requires_check_in` | Rooms release themselves when nobody turns up; a projector has nothing to check into. |
| `audit_logs.diff` | `jsonb`, written in the same transaction as the change, so "who changed what" can never drift from the data. |
