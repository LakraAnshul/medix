-- ============================================================================
-- 007_create_appointments.sql
--
-- DOUBLE BOOKING / RACE CONDITIONS — the core concurrency concern.
--
-- "Check availability in the frontend, then insert" is unsafe: two users can
-- both pass the check before either inserts. Server-side "SELECT then INSERT"
-- is equally unsafe at READ COMMITTED, because neither transaction sees the
-- other's uncommitted row.
--
-- The fix is a real database constraint. `time_range` holds the half-open
-- interval [scheduled_at, scheduled_at + duration_minutes) and carries two
-- GiST EXCLUDE constraints:
--
--   appointments_no_double_booking   — one doctor cannot hold two live
--                                      appointments that overlap in time
--   appointments_patient_no_overlap  — one patient cannot be in two places at
--                                      once
--
-- Both are partial (WHERE status IN ('pending','confirmed')) so that cancelled
-- and completed history does not block rebooking the same slot.
--
-- Under concurrency, the second inserter blocks on the GiST index and then
-- fails with SQLSTATE 23P01 (exclusion_violation). Exactly one transaction can
-- win. This is enforced by the storage engine, so it holds no matter which
-- client, script, or key performs the insert.
--
-- time_range must be a trigger-maintained column rather than GENERATED ALWAYS:
-- the `timestamptz + interval` operator is only STABLE (its result depends on
-- the TimeZone setting), and generated columns require an IMMUTABLE expression.
-- The BEFORE INSERT/UPDATE trigger in migration 010 always recomputes it from
-- scheduled_at and duration_minutes, so a client cannot forge a narrow range to
-- slip past the exclusion constraints.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.appointments (
  id                  uuid primary key default gen_random_uuid(),

  -- RESTRICT: appointments are medical history and must outlive convenience.
  patient_id          uuid not null references public.profiles (id) on delete restrict,
  doctor_id           uuid not null references public.doctor_profiles (user_id) on delete restrict,

  -- Which published window this booking consumed. SET NULL so that tidying up
  -- availability never destroys the appointment.
  availability_id     uuid references public.doctor_availability (id) on delete set null,

  scheduled_at        timestamptz not null,
  duration_minutes    integer not null default 30,
  status              public.appointment_status not null default 'pending',
  meeting_id          text,
  fee                 numeric(10, 2) not null default 0,

  cancelled_by        uuid references public.profiles (id) on delete set null,
  cancellation_reason text,

  -- Server-derived. Never trusted from the client.
  time_range          tstzrange not null,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint appointments_duration_range
    check (duration_minutes > 0 and duration_minutes <= 480),
  constraint appointments_fee_range
    check (fee >= 0 and fee <= 1000000),

  -- A doctor cannot be their own patient.
  constraint appointments_distinct_parties
    check (patient_id <> doctor_id),

  constraint appointments_meeting_id_length
    check (meeting_id is null or char_length(btrim(meeting_id)) between 4 and 128),
  constraint appointments_cancellation_reason_length
    check (cancellation_reason is null or char_length(cancellation_reason) <= 2000),

  -- time_range must genuinely describe the booking.
  constraint appointments_time_range_matches
    check (
      not isempty(time_range)
      and lower(time_range) = scheduled_at
      and lower_inc(time_range)
      and not upper_inc(time_range)
    ),

  constraint appointments_no_double_booking
    exclude using gist (doctor_id with =, time_range with &&)
    where (status in ('pending', 'confirmed')),

  constraint appointments_patient_no_overlap
    exclude using gist (patient_id with =, time_range with &&)
    where (status in ('pending', 'confirmed'))
);

comment on table public.appointments is
  'Bookings. Double booking is prevented by GiST EXCLUDE constraints, which are concurrency-safe.';
comment on column public.appointments.time_range is
  'Server-derived [scheduled_at, scheduled_at + duration_minutes). Backs the exclusion constraints.';
comment on column public.appointments.fee is
  'Copied server-side from doctor_profiles.consultation_fee; a client-supplied value is ignored.';
comment on constraint appointments_no_double_booking on public.appointments is
  'Two live appointments for one doctor cannot overlap. Raises SQLSTATE 23P01 on the losing transaction.';

-- A video meeting id, once issued, must identify exactly one appointment.
create unique index if not exists appointments_meeting_id_key
  on public.appointments (meeting_id)
  where meeting_id is not null;

create index if not exists appointments_patient_idx
  on public.appointments (patient_id, scheduled_at desc);

create index if not exists appointments_doctor_idx
  on public.appointments (doctor_id, scheduled_at desc);

create index if not exists appointments_status_idx
  on public.appointments (status);

drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();
