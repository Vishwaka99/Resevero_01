-- Sign-in moves from a signed cookie to Supabase Auth.
--
-- Identities and credentials now live in auth.users. This table stays the
-- profile of record, because the role is read from it on every request so that
-- a demotion or a deactivation takes effect immediately, rather than waiting
-- for a token to expire.
--
-- The link is a column rather than a shared primary key: this table's ids are
-- already referenced by reservations, audit rows and notifications, and
-- rewriting those to auth.users ids would rewrite the whole schema.

alter table users
  add column auth_user_id uuid unique references auth.users (id) on delete set null;

-- Supabase owns the credential now, so the application stops writing this
-- column. It is kept, nullable, so a database that has already been migrated
-- can be rolled back to the cookie session without having lost its hashes.
alter table users
  alter column password_hash drop not null;

comment on column users.password_hash is
  'Unused since 0002: Supabase Auth holds the credential. Kept for rollback.';

create index users_auth_user_id on users (auth_user_id) where auth_user_id is not null;
