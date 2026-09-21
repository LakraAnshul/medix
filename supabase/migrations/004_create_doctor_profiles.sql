-- ============================================================================
-- 004_create_doctor_profiles.sql
-- Doctor-specific professional profile. 1:1 with profiles.
--
-- SECURITY — the role/verification split:
--   role = 'doctor' is only a self-declared *intent* and grants nothing. It is
--   safe for a signup form to request it. Bookability and every privileged
--   doctor capability are gated on verification_status = 'verified', which an
--   admin alone can set (enforced by public.guard_doctor_profiles_write() in
--   migration 010, because RLS cannot compare OLD to NEW).
--
-- user_id is the PRIMARY KEY, making a duplicate doctor profile impossible.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.doctor_profiles (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  specialization      text not null,
  qualification       text not null,
  registration_number text not null,
  experience_years    integer not null default 0,
  consultation_fee    numeric(10, 2) not null default 0,
  bio                 text,
  verification_status public.verification_status not null default 'pending',
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint doctor_profiles_specialization_length
    check (char_length(btrim(specialization)) between 2 and 120),
  constraint doctor_profiles_qualification_length
    check (char_length(btrim(qualification)) between 2 and 200),
  constraint doctor_profiles_registration_number_length
    check (char_length(btrim(registration_number)) between 3 and 64),

  constraint doctor_profiles_experience_range
    check (experience_years >= 0 and experience_years <= 70),
  constraint doctor_profiles_consultation_fee_range
    check (consultation_fee >= 0 and consultation_fee <= 1000000),

  constraint doctor_profiles_bio_length
    check (bio is null or char_length(bio) <= 4000),

  -- An admin may not verify themselves into someone else's doctor record and
  -- may not be the doctor being verified.
  constraint doctor_profiles_verifier_not_self
    check (verified_by is null or verified_by <> user_id),

  -- Any decided (non-pending) status must carry a review timestamp.
  constraint doctor_profiles_decision_has_timestamp
    check (verification_status = 'pending' or verified_at is not null)
);

comment on table public.doctor_profiles is
  'Professional profile for role=doctor users. Only verification_status = verified is bookable.';
comment on column public.doctor_profiles.verification_status is
  'Admin-controlled. Immutable from any doctor/patient session (guard trigger).';
comment on column public.doctor_profiles.consultation_fee is
  'Authoritative fee. Appointment fees are copied from here server-side, never from the client.';

-- Case-insensitive uniqueness on the medical council registration number stops
-- two accounts claiming the same practitioner identity.
create unique index if not exists doctor_profiles_registration_number_key
  on public.doctor_profiles (lower(btrim(registration_number)));

create index if not exists doctor_profiles_verification_status_idx
  on public.doctor_profiles (verification_status);

create index if not exists doctor_profiles_specialization_idx
  on public.doctor_profiles (lower(specialization));

drop trigger if exists doctor_profiles_set_updated_at on public.doctor_profiles;
create trigger doctor_profiles_set_updated_at
  before update on public.doctor_profiles
  for each row execute function public.set_updated_at();
