-- ============================================================================
-- 006_create_doctor_availability.sql
-- Publishable time windows a doctor offers.
--
-- SECURITY / CORRECTNESS — overlapping windows:
--   Overlap is prevented by a GiST EXCLUDE constraint, not by frontend checks.
--   Two concurrent transactions inserting overlapping windows for the same
--   doctor cannot both commit: the second blocks and then fails. This is the
--   only approach that is actually safe under concurrency.
--
--   tstzrange(start_time, end_time) is legal directly inside the constraint
--   because the two-argument tstzrange() is IMMUTABLE. Contrast with
--   appointments, where `scheduled_at + interval` is only STABLE and therefore
--   requires a trigger-maintained column.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.doctor_availability (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references public.doctor_profiles (user_id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null,
  status     public.availability_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint doctor_availability_time_order
    check (end_time > start_time),

  -- Reject degenerate and absurd windows.
  constraint doctor_availability_min_duration
    check (end_time - start_time >= interval '5 minutes'),
  constraint doctor_availability_max_duration
    check (end_time - start_time <= interval '12 hours'),

  -- No two windows for the same doctor may overlap, whatever their status.
  constraint doctor_availability_no_overlap
    exclude using gist (
      doctor_id with =,
      tstzrange(start_time, end_time, '[)') with &&
    )
);

comment on table public.doctor_availability is
  'Doctor-published time windows. Overlap is impossible by EXCLUDE constraint, not by client validation.';
comment on constraint doctor_availability_no_overlap on public.doctor_availability is
  'Concurrency-safe overlap prevention (requires btree_gist for uuid equality).';

create index if not exists doctor_availability_doctor_start_idx
  on public.doctor_availability (doctor_id, start_time);

create index if not exists doctor_availability_open_slots_idx
  on public.doctor_availability (doctor_id, start_time)
  where status = 'available';

drop trigger if exists doctor_availability_set_updated_at on public.doctor_availability;
create trigger doctor_availability_set_updated_at
  before update on public.doctor_availability
  for each row execute function public.set_updated_at();
