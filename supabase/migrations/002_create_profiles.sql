-- ============================================================================
-- 002_create_profiles.sql
-- Core identity table. One row per auth.users row.
--
-- SECURITY — role assignment:
--   `role` is NEVER writable by the client. It is set by the
--   public.handle_new_user() trigger (migration 010) which sanitises the
--   client-supplied signup metadata, and it is pinned on UPDATE by
--   public.guard_profiles_write(). 'admin' is unreachable from any client path.
--
-- ON DELETE CASCADE from auth.users is deliberate: a profile whose auth user is
-- gone is unusable and would be an orphan. Medical/consent/appointment history
-- is protected separately with ON DELETE RESTRICT on the referencing tables,
-- which means hard-deleting a user who has history is intentionally blocked.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.app_role not null default 'patient',
  full_name     text not null,
  date_of_birth date,
  gender        public.gender_type,
  phone         text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_full_name_length
    check (char_length(btrim(full_name)) between 2 and 120),

  -- E.164-ish. Deliberately permissive about country prefix, strict about shape.
  constraint profiles_phone_format
    check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),

  -- Lower bound only. "Not in the future" is enforced by the guard trigger,
  -- because CHECK constraints must not depend on non-immutable values such as
  -- current_date (it would break pg_dump/restore).
  constraint profiles_date_of_birth_range
    check (date_of_birth is null or date_of_birth >= date '1900-01-01'),

  constraint profiles_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 1024)
);

comment on table public.profiles is
  'Identity and shared demographics for every user. role is server-assigned only.';
comment on column public.profiles.role is
  'Server-assigned. Sanitised on signup, immutable on update except by an admin.';
comment on column public.profiles.avatar_url is
  'Storage object path inside the private profile-images bucket, not a public URL.';

create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
