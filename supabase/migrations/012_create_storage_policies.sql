-- ============================================================================
-- 012_create_storage_policies.sql
--
-- Four PRIVATE buckets plus RLS policies on storage.objects.
--
-- PATH CONVENTION
--   <owner_uuid>/<random_uuid>.<ext>
--
--   The first path segment is the owning user and is the authorization anchor:
--   every policy compares it to auth.uid() (or evaluates consent against it).
--   The second segment is a random UUID, never the original filename, so object
--   names are unguessable and cannot leak patient information through the path
--   itself.
--
--   The client-supplied path is never trusted on its own — a caller can write any
--   `name` they like, so the policy is what pins it to their own folder. For
--   doctor credentials the database goes further: the
--   doctor_credentials_document_path_is_owned CHECK in migration 005 refuses to
--   register a path outside <doctor_id>/, which closes the gap between Storage
--   and the metadata table.
--
--   public.safe_uuid() is used for the cast because `name` is attacker-controlled
--   and a bare `::uuid` on a malformed segment would raise 22P02 instead of
--   simply denying access.
--
-- NONE OF THESE BUCKETS IS PUBLIC. Reads require a signed URL, which the storage
-- API only issues after these same policies pass.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

-- ----------------------------------------------------------------------------
-- 1. Buckets
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-reports',    'medical-reports',    false, 20971520,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('doctor-credentials', 'doctor-credentials', false, 20971520,
   array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('prescriptions',      'prescriptions',      false, 10485760,
   array['application/pdf']),
  ('profile-images',     'profile-images',     false,  5242880,
   array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = false,          -- re-assert privacy on every run
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 2. profile-images
--    Owner-managed. Readable by the owner, by anyone for a *verified doctor*
--    (so the public directory can render avatars through signed URLs), and by
--    admins.
-- ----------------------------------------------------------------------------

drop policy if exists profile_images_select_own      on storage.objects;
drop policy if exists profile_images_select_doctor   on storage.objects;
drop policy if exists profile_images_select_admin    on storage.objects;
drop policy if exists profile_images_insert_own      on storage.objects;
drop policy if exists profile_images_update_own      on storage.objects;
drop policy if exists profile_images_delete_own      on storage.objects;

create policy profile_images_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy profile_images_select_doctor
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'profile-images'
    and public.is_verified_doctor(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy profile_images_select_admin
  on storage.objects for select to authenticated
  using (bucket_id = 'profile-images' and public.is_admin());

create policy profile_images_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy profile_images_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy profile_images_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 3. doctor-credentials
--    The most sensitive bucket. Readable ONLY by the owning doctor and admins.
--    Patients have no policy here whatsoever.
-- ----------------------------------------------------------------------------

drop policy if exists doctor_credentials_select_own   on storage.objects;
drop policy if exists doctor_credentials_select_admin on storage.objects;
drop policy if exists doctor_credentials_insert_own   on storage.objects;
drop policy if exists doctor_credentials_update_own   on storage.objects;
drop policy if exists doctor_credentials_delete_own   on storage.objects;

create policy doctor_credentials_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'doctor-credentials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy doctor_credentials_select_admin
  on storage.objects for select to authenticated
  using (bucket_id = 'doctor-credentials' and public.is_admin());

-- Only a doctor may upload, and only into their own folder.
create policy doctor_credentials_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'doctor-credentials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.current_app_role() = 'doctor'
  );

create policy doctor_credentials_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'doctor-credentials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'doctor-credentials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy doctor_credentials_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'doctor-credentials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 4. medical-reports
--    Patient-owned. A doctor gains read access only while an explicit consent is
--    granted, and loses it the moment the patient revokes.
-- ----------------------------------------------------------------------------

drop policy if exists medical_reports_select_own     on storage.objects;
drop policy if exists medical_reports_select_consent on storage.objects;
drop policy if exists medical_reports_select_admin   on storage.objects;
drop policy if exists medical_reports_insert_own     on storage.objects;
drop policy if exists medical_reports_update_own     on storage.objects;
drop policy if exists medical_reports_delete_own     on storage.objects;

create policy medical_reports_select_own
  on storage.objects for select to authenticated
  using (
    bucket_id = 'medical-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy medical_reports_select_consent
  on storage.objects for select to authenticated
  using (
    bucket_id = 'medical-reports'
    and public.current_app_role() = 'doctor'
    and public.has_active_consent(
          public.safe_uuid((storage.foldername(name))[1]),
          (select auth.uid()),
          array['medical_records', 'reports', 'general']::public.consent_scope[]
        )
  );

create policy medical_reports_select_admin
  on storage.objects for select to authenticated
  using (bucket_id = 'medical-reports' and public.is_admin());

create policy medical_reports_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'medical-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy medical_reports_update_own
  on storage.objects for update to authenticated
  using (
    bucket_id = 'medical-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'medical-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy medical_reports_delete_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'medical-reports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 5. prescriptions
--    Path is prescriptions/<patient_id>/<uuid>.pdf
--
--    A patient may READ their prescriptions but may NOT write them — otherwise a
--    patient could forge a prescription for themselves. Writing is reserved for a
--    verified doctor holding an active consult/general consent. No UPDATE or
--    DELETE policy exists for anyone: a dispensed prescription is an immutable
--    clinical record.
-- ----------------------------------------------------------------------------

drop policy if exists prescriptions_select_patient on storage.objects;
drop policy if exists prescriptions_select_doctor  on storage.objects;
drop policy if exists prescriptions_select_admin   on storage.objects;
drop policy if exists prescriptions_insert_doctor  on storage.objects;

create policy prescriptions_select_patient
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy prescriptions_select_doctor
  on storage.objects for select to authenticated
  using (
    bucket_id = 'prescriptions'
    and public.current_app_role() = 'doctor'
    and public.has_active_consent(
          public.safe_uuid((storage.foldername(name))[1]),
          (select auth.uid()),
          array['consultation', 'general']::public.consent_scope[]
        )
  );

create policy prescriptions_select_admin
  on storage.objects for select to authenticated
  using (bucket_id = 'prescriptions' and public.is_admin());

create policy prescriptions_insert_doctor
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prescriptions'
    and public.is_verified_doctor((select auth.uid()))
    and public.has_active_consent(
          public.safe_uuid((storage.foldername(name))[1]),
          (select auth.uid()),
          array['consultation', 'general']::public.consent_scope[]
        )
  );
