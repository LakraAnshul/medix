-- ============================================================================
-- 010_create_security_functions.sql
--
-- Authorization helpers, privilege-escalation guards, signup handling, and the
-- audit trail writers.
--
-- WHY TRIGGERS AND NOT ONLY RLS
-- -----------------------------
-- An RLS policy's WITH CHECK clause can only see the NEW row. It cannot compare
-- NEW to OLD. That makes RLS alone structurally incapable of expressing
-- "you may update your profile but not change your own role", or "you may edit
-- your doctor profile but not set verification_status = verified".
--
-- Those rules are therefore enforced in BEFORE INSERT/UPDATE triggers, with RLS
-- as the outer layer deciding *which rows* are reachable at all. Triggers also
-- apply to the RLS-bypassing secret key, so the invariants hold even for
-- server-side code.
--
-- WHY SECURITY DEFINER
-- --------------------
-- A policy on `profiles` that itself reads `profiles` recurses infinitely.
-- SECURITY DEFINER functions owned by the table owner bypass RLS, breaking the
-- cycle. Every one of them:
--   * returns a boolean or enum only — never a row of user data, so they cannot
--     be used as a data-exfiltration primitive;
--   * pins `search_path = ''` and fully qualifies every name, so a caller cannot
--     shadow `public` or `auth` with a malicious schema.
--
-- TRUSTED CONTEXT
-- ---------------
-- `auth.uid() IS NULL` is treated as a trusted server-side context (direct SQL,
-- the secret key, or an auth trigger during signup). That is only sound because
-- migration 011 revokes INSERT/UPDATE/DELETE from `anon` entirely, so an
-- unauthenticated request can never reach a write path.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1. Authorization helpers
-- ----------------------------------------------------------------------------

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function public.current_app_role() is
  'Role of the caller, read with RLS bypassed to avoid recursive policy evaluation.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

comment on function public.is_admin() is
  'True when the caller holds role=admin. Never derived from client input.';

-- True in a trusted server-side context: no end-user JWT is present.
create or replace function public.is_trusted_context()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is null;
$$;

comment on function public.is_trusted_context() is
  'True when there is no end-user JWT (direct SQL / secret key / signup trigger). anon has no DML grants, so this cannot be reached by an unauthenticated request.';

create or replace function public.is_verified_doctor(p_doctor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.doctor_profiles d
    where d.user_id = p_doctor_id
      and d.verification_status = 'verified'
  );
$$;

comment on function public.is_verified_doctor(uuid) is
  'Bookability gate. role=doctor alone is never sufficient.';

create or replace function public.has_active_consent(
  p_patient_id uuid,
  p_doctor_id  uuid,
  p_scopes     public.consent_scope[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.consents c
    where c.patient_id = p_patient_id
      and c.doctor_id  = p_doctor_id
      and c.status     = 'granted'
      and c.revoked_at is null
      and c.scope      = any (p_scopes)
  );
$$;

comment on function public.has_active_consent(uuid, uuid, public.consent_scope[]) is
  'True only while a matching consent row is still granted. Revocation closes this immediately.';

create or replace function public.shares_live_appointment(
  p_patient_id uuid,
  p_doctor_id  uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    where a.patient_id = p_patient_id
      and a.doctor_id  = p_doctor_id
      and a.status in ('pending', 'confirmed', 'completed')
  );
$$;

comment on function public.shares_live_appointment(uuid, uuid) is
  'True when the pair share a non-cancelled appointment. Used to expose patient identity (name/phone) to the treating doctor only.';

-- Identity-level read access: the treating doctor, or a doctor holding any
-- active consent.
create or replace function public.doctor_may_read_patient_identity(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_app_role() = 'doctor'
    and (
      public.shares_live_appointment(p_patient_id, (select auth.uid()))
      or public.has_active_consent(
           p_patient_id,
           (select auth.uid()),
           array['medical_records', 'consultation', 'reports', 'general']::public.consent_scope[]
         )
    );
$$;

-- Clinical-record read access: consent is mandatory. Sharing an appointment is
-- deliberately NOT sufficient here.
create or replace function public.doctor_may_read_patient_clinical(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.current_app_role() = 'doctor'
    and public.has_active_consent(
          p_patient_id,
          (select auth.uid()),
          array['medical_records', 'reports', 'general']::public.consent_scope[]
        );
$$;

comment on function public.doctor_may_read_patient_clinical(uuid) is
  'Clinical data requires an explicit, currently-granted consent. Revoking consent removes access on the next request.';

-- ----------------------------------------------------------------------------
-- 2. Audit writer
-- ----------------------------------------------------------------------------

-- Keys that must never be persisted into audit metadata.
create or replace function public.redact_audit_metadata(p_metadata jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_metadata, '{}'::jsonb) - array[
    'password', 'pass', 'passwd', 'current_password', 'new_password',
    'token', 'access_token', 'refresh_token', 'id_token', 'jwt', 'bearer',
    'secret', 'secret_key', 'api_key', 'apikey', 'anon_key',
    'service_role_key', 'publishable_key', 'authorization',
    'database_url', 'db_password', 'connection_string', 'private_key'
  ];
$$;

comment on function public.redact_audit_metadata(jsonb) is
  'Strips secret-bearing keys so a careless caller cannot persist credentials into the audit trail.';

create or replace function public.guard_audit_logs_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- SECURITY: actor_id is derived, never accepted from the client. When a
  -- session exists it always wins, so a user cannot attribute an entry to
  -- somebody else. A system/service caller (no JWT) may supply it explicitly.
  new.actor_id := coalesce(v_uid, new.actor_id);

  if new.actor_id is not null then
    select p.role into new.actor_role
    from public.profiles p
    where p.id = new.actor_id;
  end if;

  new.created_at := now();
  new.metadata   := public.redact_audit_metadata(new.metadata);

  return new;
end;
$$;

create or replace function public.block_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'audit_logs is append-only; % is not permitted', tg_op
    using errcode = '42501',
          hint = 'Retention purges require: ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only;';
end;
$$;

comment on function public.block_audit_log_mutation() is
  'Makes audit_logs append-only even for the RLS-bypassing secret key.';

-- Writes an audit row with RLS bypassed. Callable from guard triggers.
create or replace function public.record_audit(
  p_action        text,
  p_resource_type text,
  p_resource_id   uuid,
  p_metadata      jsonb default '{}'::jsonb,
  p_actor_id      uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (coalesce((select auth.uid()), p_actor_id), p_action, p_resource_type, p_resource_id,
          coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Generic AFTER INSERT/UPDATE audit trigger.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action      text;
  v_resource_id uuid;
  v_metadata    jsonb := '{}'::jsonb;
  v_actor       uuid  := (select auth.uid());
begin
  if tg_table_name = 'profiles' then
    v_resource_id := new.id;
    if tg_op = 'INSERT' then
      v_action  := 'PROFILE_CREATED';
      v_metadata := jsonb_build_object('role', new.role);
      v_actor   := coalesce(v_actor, new.id);
    elsif new.role is distinct from old.role then
      v_action   := 'PROFILE_ROLE_CHANGED';
      v_metadata := jsonb_build_object('from', old.role, 'to', new.role);
    else
      v_action := 'PROFILE_UPDATED';
    end if;

  elsif tg_table_name = 'patient_profiles' then
    v_resource_id := new.user_id;
    v_action := case tg_op when 'INSERT' then 'PATIENT_PROFILE_CREATED'
                           else 'PATIENT_PROFILE_UPDATED' end;
    v_actor  := coalesce(v_actor, new.user_id);

  elsif tg_table_name = 'doctor_profiles' then
    v_resource_id := new.user_id;
    if tg_op = 'INSERT' then
      v_action := 'DOCTOR_PROFILE_CREATED';
      v_actor  := coalesce(v_actor, new.user_id);
    elsif new.verification_status is distinct from old.verification_status then
      v_action := case new.verification_status
                    when 'verified'  then 'DOCTOR_VERIFIED'
                    when 'rejected'  then 'DOCTOR_REJECTED'
                    when 'suspended' then 'DOCTOR_SUSPENDED'
                    else 'DOCTOR_VERIFICATION_RESET'
                  end;
      v_metadata := jsonb_build_object(
        'from', old.verification_status, 'to', new.verification_status
      );
    else
      v_action := 'DOCTOR_PROFILE_UPDATED';
    end if;

  elsif tg_table_name = 'doctor_credentials' then
    v_resource_id := new.id;
    if tg_op = 'INSERT' then
      v_action   := 'DOCTOR_CREDENTIAL_UPLOADED';
      v_metadata := jsonb_build_object('credential_type', new.credential_type);
      v_actor    := coalesce(v_actor, new.doctor_id);
    elsif new.verification_status is distinct from old.verification_status then
      v_action   := case new.verification_status
                      when 'verified' then 'DOCTOR_CREDENTIAL_APPROVED'
                      when 'rejected' then 'DOCTOR_CREDENTIAL_REJECTED'
                      else 'DOCTOR_CREDENTIAL_STATUS_CHANGED'
                    end;
      v_metadata := jsonb_build_object(
        'credential_type', new.credential_type,
        'from', old.verification_status,
        'to',   new.verification_status,
        'doctor_id', new.doctor_id
      );
    else
      v_action := 'DOCTOR_CREDENTIAL_UPDATED';
    end if;

  elsif tg_table_name = 'appointments' then
    v_resource_id := new.id;
    if tg_op = 'INSERT' then
      v_action   := 'APPOINTMENT_CREATED';
      v_metadata := jsonb_build_object(
        'doctor_id', new.doctor_id, 'scheduled_at', new.scheduled_at
      );
      v_actor    := coalesce(v_actor, new.patient_id);
    elsif new.status is distinct from old.status then
      v_action   := case new.status
                      when 'cancelled' then 'APPOINTMENT_CANCELLED'
                      when 'confirmed' then 'APPOINTMENT_CONFIRMED'
                      when 'completed' then 'APPOINTMENT_COMPLETED'
                      when 'no_show'   then 'APPOINTMENT_NO_SHOW'
                      else 'APPOINTMENT_STATUS_CHANGED'
                    end;
      v_metadata := jsonb_build_object('from', old.status, 'to', new.status);
    else
      v_action := 'APPOINTMENT_UPDATED';
    end if;

  elsif tg_table_name = 'consents' then
    v_resource_id := new.id;
    if tg_op = 'INSERT' then
      v_action := 'CONSENT_GRANTED';
      v_actor  := coalesce(v_actor, new.patient_id);
    elsif new.status is distinct from old.status then
      v_action := case new.status when 'revoked' then 'CONSENT_REVOKED'
                                  else 'CONSENT_STATUS_CHANGED' end;
    else
      v_action := 'CONSENT_UPDATED';
    end if;
    v_metadata := v_metadata || jsonb_build_object(
      'scope', new.scope, 'doctor_id', new.doctor_id
    );

  else
    return new;
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (v_actor, v_action, tg_table_name, v_resource_id, v_metadata);

  return new;
end;
$$;

comment on function public.audit_row_change() is
  'AFTER INSERT/UPDATE audit writer. Records only identifiers and status transitions, never clinical content.';

-- ----------------------------------------------------------------------------
-- 3. Privilege-escalation guards
-- ----------------------------------------------------------------------------

create or replace function public.guard_profiles_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
begin
  -- Not expressible as a CHECK constraint: current_date is not IMMUTABLE.
  if new.date_of_birth is not null and new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future'
      using errcode = '22007';
  end if;

  if tg_op = 'INSERT' then
    -- SECURITY: the self-service fallback path may only ever create a patient.
    -- 'doctor' comes from the sanitised signup trigger (trusted context) and
    -- 'admin' is unreachable from any client.
    if not v_privileged and new.role <> 'patient' then
      raise exception 'role % cannot be self-assigned', new.role
        using errcode = '42501';
    end if;
    new.created_at := now();
    new.updated_at := now();

  else
    -- Immutable identity/bookkeeping columns.
    new.id         := old.id;
    new.created_at := old.created_at;

    if not v_privileged and new.role is distinct from old.role then
      raise exception 'you are not permitted to change your own role'
        using errcode = '42501',
              detail  = format('attempted %s -> %s', old.role, new.role);
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_profiles_write() is
  'Blocks self-service role changes (privilege escalation) and pins immutable columns.';

create or replace function public.guard_patient_profiles_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.profiles p
      where p.id = new.user_id and p.role = 'patient'
    ) then
      raise exception 'patient_profiles.user_id must reference a profile with role=patient'
        using errcode = '23514';
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.user_id    := old.user_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.guard_doctor_profiles_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := (select auth.uid());
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.profiles p
      where p.id = new.user_id and p.role = 'doctor'
    ) then
      raise exception 'doctor_profiles.user_id must reference a profile with role=doctor'
        using errcode = '23514';
    end if;

    -- A new doctor always starts unverified, whoever creates the row.
    if not v_privileged then
      new.verification_status := 'pending';
      new.verified_by := null;
      new.verified_at := null;
    end if;
    new.created_at := now();
    new.updated_at := now();

  else
    new.user_id    := old.user_id;
    new.created_at := old.created_at;

    if not v_privileged then
      -- SECURITY: a doctor cannot verify themselves. RLS cannot express this
      -- because it cannot see OLD.
      if new.verification_status is distinct from old.verification_status then
        raise exception 'only an administrator may change verification_status'
          using errcode = '42501',
                detail  = format('attempted %s -> %s',
                                 old.verification_status, new.verification_status);
      end if;
      new.verified_by := old.verified_by;
      new.verified_at := old.verified_at;

    elsif new.verification_status is distinct from old.verification_status then
      -- Administrative decision: stamp the reviewer server-side.
      new.verified_by := coalesce(v_uid, new.verified_by);
      new.verified_at := now();

      if new.verified_by is not null and new.verified_by = new.user_id then
        raise exception 'a doctor cannot approve their own verification'
          using errcode = '42501';
      end if;

      -- A doctor becomes bookable only on the strength of approved evidence.
      if new.verification_status = 'verified' and not exists (
        select 1 from public.doctor_credentials c
        where c.doctor_id = new.user_id
          and c.verification_status = 'verified'
      ) then
        raise exception 'cannot verify a doctor with no approved credential'
          using errcode = '42501',
                hint = 'Approve at least one doctor_credentials row for this doctor first.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_doctor_profiles_write() is
  'Pins verification_status against non-admins and requires an approved credential before a doctor can be verified.';

create or replace function public.guard_doctor_credentials_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := (select auth.uid());
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
begin
  if tg_op = 'INSERT' then
    if not v_privileged then
      if new.doctor_id <> v_uid then
        raise exception 'credentials may only be uploaded for your own account'
          using errcode = '42501';
      end if;
      new.verification_status := 'pending';
      new.reviewed_by      := null;
      new.reviewed_at      := null;
      new.rejection_reason := null;
    end if;
    new.created_at := now();
    new.updated_at := now();

  else
    new.id         := old.id;
    new.doctor_id  := old.doctor_id;
    new.created_at := old.created_at;

    if not v_privileged then
      -- A doctor may correct the display name, nothing else that matters.
      if new.verification_status is distinct from old.verification_status
         or new.reviewed_by      is distinct from old.reviewed_by
         or new.reviewed_at      is distinct from old.reviewed_at
         or new.rejection_reason is distinct from old.rejection_reason
         or new.document_path    is distinct from old.document_path then
        raise exception 'only an administrator may review a credential'
          using errcode = '42501';
      end if;

    elsif new.verification_status is distinct from old.verification_status then
      new.reviewed_by := coalesce(v_uid, new.reviewed_by);
      new.reviewed_at := now();

      -- Defence in depth; doctor_credentials_reviewer_not_self also enforces it.
      if new.reviewed_by is not null and new.reviewed_by = new.doctor_id then
        raise exception 'a doctor cannot review their own credential'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_doctor_availability_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := (select auth.uid());
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
begin
  if tg_op = 'INSERT' then
    if not v_privileged and new.doctor_id <> v_uid then
      raise exception 'you may only publish availability for your own account'
        using errcode = '42501';
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.id         := old.id;
    new.doctor_id  := old.doctor_id;
    new.created_at := old.created_at;
  end if;

  -- Publishing history is pointless and invites accidental bookings in the past.
  if tg_op = 'INSERT' and new.end_time <= now() then
    raise exception 'availability must end in the future'
      using errcode = '22007';
  end if;

  return new;
end;
$$;

create or replace function public.guard_appointments_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := (select auth.uid());
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
  v_fee        numeric(10, 2);
begin
  if tg_op = 'INSERT' then
    -- SECURITY: the range backing the exclusion constraints is always derived
    -- server-side. A client cannot submit a narrow range to slip past it.
    new.time_range := tstzrange(
      new.scheduled_at,
      new.scheduled_at + make_interval(mins => new.duration_minutes),
      '[)'
    );

    if not v_privileged and new.patient_id <> v_uid then
      raise exception 'you may only book an appointment for yourself'
        using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.id = new.patient_id and p.role = 'patient'
    ) then
      raise exception 'patient_id must reference a profile with role=patient'
        using errcode = '23514';
    end if;

    -- role=doctor is not enough; the doctor must be verified.
    if not public.is_verified_doctor(new.doctor_id) then
      raise exception 'this doctor is not verified and cannot be booked'
        using errcode = '42501';
    end if;

    if new.scheduled_at <= now() then
      raise exception 'appointments must be scheduled in the future'
        using errcode = '22007';
    end if;

    -- The booking must fall inside a published, open window.
    if not exists (
      select 1
      from public.doctor_availability a
      where a.doctor_id = new.doctor_id
        and a.status = 'available'
        and tstzrange(a.start_time, a.end_time, '[)') @> new.time_range
    ) then
      raise exception 'the requested slot is not inside the doctor''s published availability'
        using errcode = '42501';
    end if;

    -- SECURITY (mass assignment): the fee is authoritative from the doctor's
    -- profile. A client-supplied fee is discarded.
    select d.consultation_fee into v_fee
    from public.doctor_profiles d
    where d.user_id = new.doctor_id;
    new.fee := coalesce(v_fee, 0);

    -- A patient cannot self-confirm.
    if not v_privileged then
      new.status       := 'pending';
      new.cancelled_by := null;
      new.meeting_id   := null;
    end if;

    new.created_at := now();
    new.updated_at := now();

  else
    new.id         := old.id;
    new.created_at := old.created_at;

    if not v_privileged then
      if new.patient_id is distinct from old.patient_id
         or new.doctor_id is distinct from old.doctor_id
         or new.fee       is distinct from old.fee then
        raise exception 'patient, doctor and fee are immutable on an appointment'
          using errcode = '42501';
      end if;
    end if;

    new.time_range := tstzrange(
      new.scheduled_at,
      new.scheduled_at + make_interval(mins => new.duration_minutes),
      '[)'
    );

    if old.status in ('completed', 'cancelled', 'no_show')
       and new.status is distinct from old.status then
      raise exception 'appointment status % is final', old.status
        using errcode = '42501';
    end if;

    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.cancelled_by := coalesce(v_uid, new.cancelled_by);
    end if;

    -- Only the treating doctor (or an admin) may advance the clinical status.
    if new.status in ('confirmed', 'completed', 'no_show')
       and new.status is distinct from old.status
       and not v_privileged
       and v_uid <> old.doctor_id then
      raise exception 'only the treating doctor may set status to %', new.status
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_appointments_write() is
  'Derives time_range and fee server-side, enforces verified-doctor-only booking, published-slot booking, self-booking only, and legal status transitions.';

create or replace function public.guard_consents_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := (select auth.uid());
  v_privileged boolean := public.is_admin() or public.is_trusted_context();
begin
  if tg_op = 'INSERT' then
    -- SECURITY: only the patient may grant consent. A doctor cannot manufacture
    -- consent on a patient's behalf.
    if not v_privileged and new.patient_id <> v_uid then
      raise exception 'only the patient may grant consent'
        using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.profiles p
      where p.id = new.patient_id and p.role = 'patient'
    ) then
      raise exception 'patient_id must reference a profile with role=patient'
        using errcode = '23514';
    end if;

    new.status     := 'granted';
    new.granted_at := now();
    new.revoked_at := null;
    new.created_at := now();
    new.updated_at := now();

  else
    new.id         := old.id;
    new.patient_id := old.patient_id;
    new.doctor_id  := old.doctor_id;
    new.scope      := old.scope;
    new.granted_at := old.granted_at;
    new.created_at := old.created_at;

    if not v_privileged and old.patient_id <> v_uid then
      raise exception 'only the patient may modify their consent'
        using errcode = '42501';
    end if;

    -- granted -> revoked is the only legal transition. Re-granting must insert
    -- a new row so the history is never rewritten.
    if old.status = 'revoked' and new.status = 'granted' then
      raise exception 'a revoked consent cannot be re-granted; insert a new consent instead'
        using errcode = '42501';
    end if;

    if new.status = 'revoked' and old.status <> 'revoked' then
      new.revoked_at := now();
    end if;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Signup handling
-- ----------------------------------------------------------------------------

-- SECURITY — this is the single most important function in the schema.
--
-- raw_user_meta_data is fully client-controlled: anyone can call
-- supabase.auth.signUp({ options: { data: { role: 'admin' } } }). The requested
-- role is therefore treated as an untrusted hint and mapped through an explicit
-- allowlist. 'doctor' is accepted because it confers nothing on its own
-- (bookability requires verification_status='verified', which only an admin can
-- set). Everything else — including 'admin' — collapses to 'patient'.
--
-- Admin accounts are consequently unreachable through any client registration
-- path and can only be created by scripts/admin/promote-admin.mjs, which
-- requires the server-side secret key.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')), '');
  v_role      public.app_role;
  v_full_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  v_phone     text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '');
begin
  -- Allowlist, not a denylist.
  v_role := case lower(coalesce(v_requested, ''))
              when 'doctor' then 'doctor'::public.app_role
              else 'patient'::public.app_role
            end;

  v_full_name := left(coalesce(v_full_name, split_part(coalesce(new.email, 'new user'), '@', 1)), 120);
  if char_length(btrim(v_full_name)) < 2 then
    v_full_name := 'New User';
  end if;

  if v_phone is not null and v_phone !~ '^\+?[0-9]{7,15}$' then
    v_phone := null;  -- drop malformed input rather than failing the signup
  end if;

  insert into public.profiles (id, role, full_name, phone)
  values (new.id, v_role, v_full_name, v_phone)
  on conflict (id) do nothing;

  if v_role = 'doctor' then
    insert into public.doctor_profiles (
      user_id, specialization, qualification, registration_number
    )
    values (
      new.id,
      left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'specialization'), ''), 'Unspecified'), 120),
      left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'qualification'), ''), 'Unspecified'), 200),
      -- Placeholder is unique per user, so the registration-number unique index
      -- cannot be used to block another doctor's signup.
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'registration_number'), ''),
        'PENDING-' || replace(new.id::text, '-', '')
      )
    )
    on conflict (user_id) do nothing;
  else
    insert into public.patient_profiles (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;

  -- Record when a client asked for something it was not given.
  if v_requested is not null and lower(v_requested) not in ('patient', 'doctor') then
    insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
    values (
      new.id, 'SIGNUP_ROLE_REQUEST_REJECTED', 'profiles', new.id,
      jsonb_build_object('requested', left(v_requested, 64), 'assigned', v_role)
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates profile + role-specific profile on signup. Sanitises client-supplied role through an allowlist so admin is unreachable from any client.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Attach the guards
-- ----------------------------------------------------------------------------

drop trigger if exists profiles_guard_write on public.profiles;
create trigger profiles_guard_write
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_write();

drop trigger if exists patient_profiles_guard_write on public.patient_profiles;
create trigger patient_profiles_guard_write
  before insert or update on public.patient_profiles
  for each row execute function public.guard_patient_profiles_write();

drop trigger if exists doctor_profiles_guard_write on public.doctor_profiles;
create trigger doctor_profiles_guard_write
  before insert or update on public.doctor_profiles
  for each row execute function public.guard_doctor_profiles_write();

drop trigger if exists doctor_credentials_guard_write on public.doctor_credentials;
create trigger doctor_credentials_guard_write
  before insert or update on public.doctor_credentials
  for each row execute function public.guard_doctor_credentials_write();

drop trigger if exists doctor_availability_guard_write on public.doctor_availability;
create trigger doctor_availability_guard_write
  before insert or update on public.doctor_availability
  for each row execute function public.guard_doctor_availability_write();

drop trigger if exists appointments_guard_write on public.appointments;
create trigger appointments_guard_write
  before insert or update on public.appointments
  for each row execute function public.guard_appointments_write();

drop trigger if exists consents_guard_write on public.consents;
create trigger consents_guard_write
  before insert or update on public.consents
  for each row execute function public.guard_consents_write();

drop trigger if exists audit_logs_guard_write on public.audit_logs;
create trigger audit_logs_guard_write
  before insert on public.audit_logs
  for each row execute function public.guard_audit_logs_write();

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.block_audit_log_mutation();

-- Audit writers (AFTER, so they only record committed-shape rows)
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after insert or update on public.profiles
  for each row execute function public.audit_row_change();

drop trigger if exists patient_profiles_audit on public.patient_profiles;
create trigger patient_profiles_audit
  after insert or update on public.patient_profiles
  for each row execute function public.audit_row_change();

drop trigger if exists doctor_profiles_audit on public.doctor_profiles;
create trigger doctor_profiles_audit
  after insert or update on public.doctor_profiles
  for each row execute function public.audit_row_change();

drop trigger if exists doctor_credentials_audit on public.doctor_credentials;
create trigger doctor_credentials_audit
  after insert or update on public.doctor_credentials
  for each row execute function public.audit_row_change();

drop trigger if exists appointments_audit on public.appointments;
create trigger appointments_audit
  after insert or update on public.appointments
  for each row execute function public.audit_row_change();

drop trigger if exists consents_audit on public.consents;
create trigger consents_audit
  after insert or update on public.consents
  for each row execute function public.audit_row_change();
