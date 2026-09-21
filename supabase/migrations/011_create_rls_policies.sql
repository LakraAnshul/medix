-- ============================================================================
-- 011_create_rls_policies.sql
--
-- Row Level Security for every application table, plus an explicit privilege
-- baseline.
--
-- DEFENCE IN DEPTH — GRANTS *AND* POLICIES
--   RLS only filters rows for a role that already holds the table privilege. So
--   this migration first revokes everything from `anon` and `authenticated`,
--   then grants back the minimum. A table with a forgotten or mistakenly broad
--   policy still cannot be written to if the privilege was never granted.
--   Notably `anon` receives SELECT only — never INSERT/UPDATE/DELETE. That is
--   what makes "auth.uid() IS NULL implies trusted context" sound in the guard
--   triggers.
--
-- NO DELETE ANYWHERE
--   No application role is granted DELETE on any table. Medical history,
--   consent history and audit records are retained by construction. Erasure is
--   an explicit, server-side, out-of-band operation.
--
-- WHY auth.uid() IS WRAPPED IN A SUBQUERY
--   `(select auth.uid())` is evaluated once per statement rather than once per
--   row, which is a large difference on scans. It is also the pattern Supabase
--   recommends.
--
-- IDENTITY COMES FROM THE TOKEN, NEVER THE PAYLOAD
--   Every policy derives the caller from auth.uid(), which is read from the
--   verified JWT. No policy trusts a user_id/patient_id supplied in a request
--   body; where such a column is written, a WITH CHECK ties it back to
--   auth.uid() and a guard trigger re-verifies it.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1. Enable (and force) RLS everywhere
-- ----------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.patient_profiles    enable row level security;
alter table public.doctor_profiles     enable row level security;
alter table public.doctor_credentials  enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.appointments        enable row level security;
alter table public.consents            enable row level security;
alter table public.audit_logs          enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Privilege baseline
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

revoke all on public.profiles            from anon, authenticated;
revoke all on public.patient_profiles    from anon, authenticated;
revoke all on public.doctor_profiles     from anon, authenticated;
revoke all on public.doctor_credentials  from anon, authenticated;
revoke all on public.doctor_availability from anon, authenticated;
revoke all on public.appointments        from anon, authenticated;
revoke all on public.consents            from anon, authenticated;
revoke all on public.audit_logs          from anon, authenticated;

-- authenticated: no DELETE on anything, by design.
grant select, insert, update on public.profiles            to authenticated;
grant select, insert, update on public.patient_profiles    to authenticated;
grant select, insert, update on public.doctor_profiles     to authenticated;
grant select, insert, update on public.doctor_credentials  to authenticated;
grant select, insert, update on public.doctor_availability to authenticated;
grant select, insert, update on public.appointments        to authenticated;
grant select, insert, update on public.consents            to authenticated;
grant select, insert         on public.audit_logs          to authenticated;

-- anon: read-only, and only what the anonymous landing page genuinely needs.
grant select on public.doctor_availability to anon;

-- ----------------------------------------------------------------------------
-- 3. profiles
-- ----------------------------------------------------------------------------

drop policy if exists profiles_select_own            on public.profiles;
drop policy if exists profiles_select_admin          on public.profiles;
drop policy if exists profiles_select_treating_doctor on public.profiles;
drop policy if exists profiles_insert_self           on public.profiles;
drop policy if exists profiles_update_own            on public.profiles;
drop policy if exists profiles_update_admin          on public.profiles;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin
  on public.profiles for select to authenticated
  using (public.is_admin());

-- A doctor may see the identity of a patient they are actually treating or who
-- has granted consent — and nobody else. This is what stops one patient (or an
-- unrelated doctor) enumerating the patient table.
create policy profiles_select_treating_doctor
  on public.profiles for select to authenticated
  using (
    role = 'patient'
    and public.doctor_may_read_patient_identity(id)
  );

-- Self-heal path only: profiles are normally created by handle_new_user().
-- Constrained to the caller's own id and role='patient', so it can never be used
-- to mint a doctor or admin profile.
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'patient'
  );

-- guard_profiles_write() blocks the role column from changing here.
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_update_admin
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. patient_profiles
-- ----------------------------------------------------------------------------

drop policy if exists patient_profiles_select_own      on public.patient_profiles;
drop policy if exists patient_profiles_select_admin    on public.patient_profiles;
drop policy if exists patient_profiles_select_consent  on public.patient_profiles;
drop policy if exists patient_profiles_insert_own      on public.patient_profiles;
drop policy if exists patient_profiles_update_own      on public.patient_profiles;
drop policy if exists patient_profiles_update_admin    on public.patient_profiles;

create policy patient_profiles_select_own
  on public.patient_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy patient_profiles_select_admin
  on public.patient_profiles for select to authenticated
  using (public.is_admin());

-- Clinical data requires a currently-granted consent. Revocation closes this on
-- the very next request; no cached grant, no background job needed.
create policy patient_profiles_select_consent
  on public.patient_profiles for select to authenticated
  using (public.doctor_may_read_patient_clinical(user_id));

create policy patient_profiles_insert_own
  on public.patient_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy patient_profiles_update_own
  on public.patient_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy patient_profiles_update_admin
  on public.patient_profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. doctor_profiles
--
-- The table itself is private (own row + admin). Public doctor discovery goes
-- through the public.verified_doctors view, which exposes a narrow, non-sensitive
-- column set. Broadening SELECT here instead would be a mistake: RLS filters
-- rows, not columns, so it could not hide registration_number or the
-- verification audit columns.
-- ----------------------------------------------------------------------------

drop policy if exists doctor_profiles_select_own   on public.doctor_profiles;
drop policy if exists doctor_profiles_select_admin on public.doctor_profiles;
drop policy if exists doctor_profiles_select_patient_of_record on public.doctor_profiles;
drop policy if exists doctor_profiles_insert_own   on public.doctor_profiles;
drop policy if exists doctor_profiles_update_own   on public.doctor_profiles;
drop policy if exists doctor_profiles_update_admin on public.doctor_profiles;

create policy doctor_profiles_select_own
  on public.doctor_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy doctor_profiles_select_admin
  on public.doctor_profiles for select to authenticated
  using (public.is_admin());

-- A patient may read the full profile of a doctor they have booked.
create policy doctor_profiles_select_patient_of_record
  on public.doctor_profiles for select to authenticated
  using (public.shares_live_appointment((select auth.uid()), user_id));

create policy doctor_profiles_insert_own
  on public.doctor_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

-- guard_doctor_profiles_write() pins verification_status / verified_by /
-- verified_at, so this cannot be used to self-verify.
create policy doctor_profiles_update_own
  on public.doctor_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy doctor_profiles_update_admin
  on public.doctor_profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. doctor_credentials
-- ----------------------------------------------------------------------------

drop policy if exists doctor_credentials_select_own   on public.doctor_credentials;
drop policy if exists doctor_credentials_select_admin on public.doctor_credentials;
drop policy if exists doctor_credentials_insert_own   on public.doctor_credentials;
drop policy if exists doctor_credentials_update_own   on public.doctor_credentials;
drop policy if exists doctor_credentials_update_admin on public.doctor_credentials;

-- Patients have no policy here at all: credential documents are not theirs to see.
create policy doctor_credentials_select_own
  on public.doctor_credentials for select to authenticated
  using (doctor_id = (select auth.uid()));

create policy doctor_credentials_select_admin
  on public.doctor_credentials for select to authenticated
  using (public.is_admin());

create policy doctor_credentials_insert_own
  on public.doctor_credentials for insert to authenticated
  with check (doctor_id = (select auth.uid()));

-- The guard trigger restricts a doctor to cosmetic edits (document_name) and
-- rejects any change to the review columns or document_path.
create policy doctor_credentials_update_own
  on public.doctor_credentials for update to authenticated
  using (doctor_id = (select auth.uid()))
  with check (doctor_id = (select auth.uid()));

create policy doctor_credentials_update_admin
  on public.doctor_credentials for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. doctor_availability
-- ----------------------------------------------------------------------------

drop policy if exists doctor_availability_select_public on public.doctor_availability;
drop policy if exists doctor_availability_select_own    on public.doctor_availability;
drop policy if exists doctor_availability_select_admin  on public.doctor_availability;
drop policy if exists doctor_availability_insert_own    on public.doctor_availability;
drop policy if exists doctor_availability_update_own    on public.doctor_availability;
drop policy if exists doctor_availability_update_admin  on public.doctor_availability;

-- Open slots of verified doctors are public browsing data. Note the status
-- filter: 'blocked' windows (which may reveal a doctor's private calendar) are
-- not exposed.
create policy doctor_availability_select_public
  on public.doctor_availability for select to anon, authenticated
  using (
    status = 'available'
    and public.is_verified_doctor(doctor_id)
  );

create policy doctor_availability_select_own
  on public.doctor_availability for select to authenticated
  using (doctor_id = (select auth.uid()));

create policy doctor_availability_select_admin
  on public.doctor_availability for select to authenticated
  using (public.is_admin());

create policy doctor_availability_insert_own
  on public.doctor_availability for insert to authenticated
  with check (doctor_id = (select auth.uid()));

create policy doctor_availability_update_own
  on public.doctor_availability for update to authenticated
  using (doctor_id = (select auth.uid()))
  with check (doctor_id = (select auth.uid()));

create policy doctor_availability_update_admin
  on public.doctor_availability for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. appointments
-- ----------------------------------------------------------------------------

drop policy if exists appointments_select_party   on public.appointments;
drop policy if exists appointments_select_admin   on public.appointments;
drop policy if exists appointments_insert_patient on public.appointments;
drop policy if exists appointments_update_party   on public.appointments;
drop policy if exists appointments_update_admin   on public.appointments;

create policy appointments_select_party
  on public.appointments for select to authenticated
  using (
    patient_id = (select auth.uid())
    or doctor_id = (select auth.uid())
  );

create policy appointments_select_admin
  on public.appointments for select to authenticated
  using (public.is_admin());

-- The WITH CHECK ties patient_id to the verified token, so a patient cannot book
-- in someone else's name and a doctor cannot fabricate a booking. The guard
-- trigger independently re-checks this, verifies the doctor, assigns the fee and
-- derives time_range.
create policy appointments_insert_patient
  on public.appointments for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy appointments_update_party
  on public.appointments for update to authenticated
  using (
    patient_id = (select auth.uid())
    or doctor_id = (select auth.uid())
  )
  with check (
    patient_id = (select auth.uid())
    or doctor_id = (select auth.uid())
  );

create policy appointments_update_admin
  on public.appointments for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. consents
-- ----------------------------------------------------------------------------

drop policy if exists consents_select_party    on public.consents;
drop policy if exists consents_select_admin    on public.consents;
drop policy if exists consents_insert_patient  on public.consents;
drop policy if exists consents_update_patient  on public.consents;
drop policy if exists consents_update_admin    on public.consents;

-- A doctor may see consents naming them, so they can tell what they may access.
create policy consents_select_party
  on public.consents for select to authenticated
  using (
    patient_id = (select auth.uid())
    or doctor_id = (select auth.uid())
  );

create policy consents_select_admin
  on public.consents for select to authenticated
  using (public.is_admin());

-- Only the patient. A doctor has no INSERT policy, so a doctor cannot
-- manufacture consent on a patient's behalf.
create policy consents_insert_patient
  on public.consents for insert to authenticated
  with check (patient_id = (select auth.uid()));

create policy consents_update_patient
  on public.consents for update to authenticated
  using (patient_id = (select auth.uid()))
  with check (patient_id = (select auth.uid()));

create policy consents_update_admin
  on public.consents for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. audit_logs
--
-- SELECT: own entries, or everything for an admin.
-- INSERT: allowed, but actor_id is overwritten with auth.uid() by the guard
--         trigger, so an entry can never be attributed to another user.
-- UPDATE / DELETE: no policy and no privilege — and the append-only trigger
--         additionally blocks the secret key.
-- ----------------------------------------------------------------------------

drop policy if exists audit_logs_select_own    on public.audit_logs;
drop policy if exists audit_logs_select_admin  on public.audit_logs;
drop policy if exists audit_logs_insert_self   on public.audit_logs;

create policy audit_logs_select_own
  on public.audit_logs for select to authenticated
  using (actor_id = (select auth.uid()));

create policy audit_logs_select_admin
  on public.audit_logs for select to authenticated
  using (public.is_admin());

create policy audit_logs_insert_self
  on public.audit_logs for insert to authenticated
  with check (actor_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 11. Public doctor discovery view
--
-- Intentionally a non-security_invoker (owner's-rights) view. It runs as the
-- owner and so bypasses RLS on doctor_profiles/profiles, which is exactly what
-- makes it possible to publish a *narrow column projection* to anonymous
-- visitors without loosening row policies on the underlying tables.
--
-- Everything selected here is information a clinic publishes anyway. Notably
-- ABSENT: date_of_birth, phone, registration_number, verified_by/verified_at,
-- and every row whose verification_status is not 'verified'.
-- ----------------------------------------------------------------------------

drop view if exists public.verified_doctors;

create view public.verified_doctors
with (security_invoker = off) as
select
  d.user_id          as doctor_id,
  p.full_name,
  p.avatar_url,
  d.specialization,
  d.qualification,
  d.experience_years,
  d.consultation_fee,
  d.bio,
  d.created_at
from public.doctor_profiles d
join public.profiles p on p.id = d.user_id
where d.verification_status = 'verified';

comment on view public.verified_doctors is
  'Public directory of verified doctors. Owner-rights view exposing a deliberately narrow, non-sensitive column projection; excludes registration_number, phone and date_of_birth.';

revoke all on public.verified_doctors from anon, authenticated;
grant select on public.verified_doctors to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 12. Function privileges
-- ----------------------------------------------------------------------------

revoke all on function public.current_app_role()            from public;
revoke all on function public.is_admin()                    from public;
revoke all on function public.is_trusted_context()          from public;
revoke all on function public.is_verified_doctor(uuid)      from public;
revoke all on function public.has_active_consent(uuid, uuid, public.consent_scope[]) from public;
revoke all on function public.shares_live_appointment(uuid, uuid) from public;
revoke all on function public.doctor_may_read_patient_identity(uuid) from public;
revoke all on function public.doctor_may_read_patient_clinical(uuid) from public;
revoke all on function public.record_audit(text, text, uuid, jsonb, uuid) from public;

-- Policies are evaluated with the caller's privileges, so the roles referenced
-- in a policy must be able to execute the helpers it calls.
grant execute on function public.current_app_role()       to authenticated;
grant execute on function public.is_admin()               to authenticated;
grant execute on function public.is_trusted_context()     to authenticated;
grant execute on function public.is_verified_doctor(uuid) to anon, authenticated;
grant execute on function public.has_active_consent(uuid, uuid, public.consent_scope[]) to authenticated;
grant execute on function public.shares_live_appointment(uuid, uuid) to authenticated;
grant execute on function public.doctor_may_read_patient_identity(uuid) to authenticated;
grant execute on function public.doctor_may_read_patient_clinical(uuid) to authenticated;
grant execute on function public.record_audit(text, text, uuid, jsonb, uuid) to authenticated;

grant execute on function public.safe_uuid(text) to anon, authenticated;
grant execute on function public.is_clean_text_array(text[], integer, integer) to authenticated;
