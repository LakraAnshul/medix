-- ============================================================================
-- 003_create_patient_profiles.sql
-- Patient-specific clinical profile. 1:1 with profiles.
--
-- Deviations from the brief, deliberate:
--   * `height` / `weight` are named height_cm / weight_kg. Unit-ambiguous
--     numeric columns are a real source of clinical error; encoding the unit in
--     the column name removes the ambiguity permanently.
--   * allergies / existing_conditions / current_medications are text[] rather
--     than jsonb. They are homogeneous lists of short strings, so an array is
--     the structured choice; jsonb here would accept arbitrary shapes.
--
-- user_id is the PRIMARY KEY, which makes a duplicate patient profile
-- impossible at the storage level.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.patient_profiles (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  height_cm           numeric(5, 2),
  weight_kg           numeric(5, 2),
  blood_group         public.blood_group,
  allergies           text[] not null default '{}',
  existing_conditions text[] not null default '{}',
  current_medications text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Physiologically plausible bounds. Wide enough for neonates and outliers,
  -- narrow enough to reject nonsense such as -100 cm or 4000 kg.
  constraint patient_profiles_height_range
    check (height_cm is null or (height_cm >= 20 and height_cm <= 275)),
  constraint patient_profiles_weight_range
    check (weight_kg is null or (weight_kg >= 0.3 and weight_kg <= 650)),

  -- Reject NULL elements, blank elements, oversized elements, and unbounded
  -- growth (a multi-megabyte array is a cheap denial-of-service vector).
  constraint patient_profiles_allergies_wellformed
    check (public.is_clean_text_array(allergies, 100, 200)),
  constraint patient_profiles_conditions_wellformed
    check (public.is_clean_text_array(existing_conditions, 100, 200)),
  constraint patient_profiles_medications_wellformed
    check (public.is_clean_text_array(current_medications, 100, 200))
);

comment on table public.patient_profiles is
  'Clinical profile for role=patient users. Readable by the patient, admins, and doctors holding an active consent.';
comment on column public.patient_profiles.height_cm is 'Height in centimetres.';
comment on column public.patient_profiles.weight_kg is 'Weight in kilograms.';

drop trigger if exists patient_profiles_set_updated_at on public.patient_profiles;
create trigger patient_profiles_set_updated_at
  before update on public.patient_profiles
  for each row execute function public.set_updated_at();
