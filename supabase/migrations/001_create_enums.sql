-- ============================================================================
-- 001_create_enums.sql
-- Extensions, enumerated domain types, and shared trigger helpers.
--
-- Design notes:
--   * Enums are used instead of free-text + CHECK so that an invalid role or
--     status is rejected by the type system itself, at parse time.
--   * btree_gist is required so that UUID equality can participate in the GiST
--     EXCLUDE constraints used later to prevent overlapping availability and
--     double-booked appointments.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ----------------------------------------------------------------------------
-- Enumerated types (idempotent)
-- ----------------------------------------------------------------------------

do $$ begin
  create type public.app_role as enum ('patient', 'doctor', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.gender_type as enum ('male', 'female', 'other', 'prefer_not_to_say');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_status as enum ('pending', 'verified', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.credential_type as enum (
    'medical_registration',
    'degree',
    'specialization_certificate',
    'identity_proof',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.availability_status as enum ('available', 'blocked', 'booked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.appointment_status as enum (
    'pending', 'confirmed', 'cancelled', 'completed', 'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_scope as enum ('medical_records', 'consultation', 'reports', 'general');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_status as enum ('granted', 'revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.blood_group as enum (
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------

-- Maintains updated_at server-side. The client value is always discarded so a
-- caller cannot backdate a record.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: forces updated_at = now(), ignoring any client-supplied value.';

-- Total cast helper: returns NULL instead of raising on a malformed UUID.
-- Used by storage policies, which parse UUIDs out of object paths that an
-- attacker can partially control.
create or replace function public.safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

comment on function public.safe_uuid(text) is
  'Total UUID cast: returns NULL for malformed input rather than raising 22P02.';

-- Validates a text[] column: no NULL elements, no blank elements, bounded item
-- count and bounded element length.
--
-- This lives in a function because a CHECK constraint may not contain a
-- subquery, and detecting a blank element requires unnest(). The function is
-- IMMUTABLE so it is legal inside a CHECK.
create or replace function public.is_clean_text_array(
  p_values   text[],
  p_max_items integer default 100,
  p_max_len   integer default 200
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    p_values is null
    or (
      array_position(p_values, null) is null
      and cardinality(p_values) <= p_max_items
      and not exists (
        select 1
        from unnest(p_values) as v(item)
        where char_length(btrim(v.item)) = 0
           or char_length(v.item) > p_max_len
      )
    );
$$;

comment on function public.is_clean_text_array(text[], integer, integer) is
  'CHECK-constraint helper: rejects NULL/blank/oversized elements and unbounded arrays.';
