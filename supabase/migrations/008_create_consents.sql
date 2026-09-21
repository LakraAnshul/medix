-- ============================================================================
-- 008_create_consents.sql
-- Patient-granted access scopes. The patient is the only grantor.
--
-- SECURITY:
--   * A doctor can never insert or modify a consent row. Enforced by RLS (no
--     INSERT/UPDATE policy for doctors) and re-checked in
--     public.guard_consents_write().
--   * Revocation never deletes. The row is retained with status='revoked' and a
--     revoked_at timestamp, so the consent history stays auditable. There is no
--     DELETE policy on this table for any application role.
--   * Only one *granted* row may exist per (patient, doctor, scope) — enforced
--     by a partial unique index — while any number of revoked rows may accumulate
--     as history.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),

  -- RESTRICT: consent history is a legal record.
  patient_id uuid not null references public.profiles (id) on delete restrict,
  doctor_id  uuid not null references public.doctor_profiles (user_id) on delete restrict,

  scope      public.consent_scope not null,
  status     public.consent_status not null default 'granted',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint consents_distinct_parties
    check (patient_id <> doctor_id),

  -- status and revoked_at can never disagree, so an "active consent" test can
  -- rely on either column.
  constraint consents_revocation_consistency
    check (
      (status = 'granted' and revoked_at is null)
      or (status = 'revoked' and revoked_at is not null)
    ),

  constraint consents_revoked_after_granted
    check (revoked_at is null or revoked_at >= granted_at)
);

comment on table public.consents is
  'Patient-controlled access grants. Revocation is a status change, never a delete, so history survives.';
comment on column public.consents.status is
  'granted -> revoked is the only permitted transition. Re-granting inserts a new row.';

create unique index if not exists consents_one_active_per_scope
  on public.consents (patient_id, doctor_id, scope)
  where status = 'granted';

create index if not exists consents_patient_idx on public.consents (patient_id);
create index if not exists consents_doctor_active_idx
  on public.consents (doctor_id, patient_id, scope)
  where status = 'granted';

drop trigger if exists consents_set_updated_at on public.consents;
create trigger consents_set_updated_at
  before update on public.consents
  for each row execute function public.set_updated_at();
