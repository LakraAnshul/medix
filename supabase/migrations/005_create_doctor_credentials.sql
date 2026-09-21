-- ============================================================================
-- 005_create_doctor_credentials.sql
-- Verification evidence uploaded by doctors and reviewed by admins.
--
-- Document BYTES are never stored here. They live in the private
-- `doctor-credentials` Storage bucket; this table stores only the object path.
--
-- SECURITY — "a doctor must not approve their own credential" is enforced three
-- times over:
--   1. doctor_credentials_reviewer_not_self CHECK  (storage-level guarantee)
--   2. public.guard_doctor_credentials_write()      (rejects self-review, pins
--      the review columns against non-admin writers)
--   3. RLS: only admins hold an UPDATE policy covering the review columns
--
-- ON DELETE RESTRICT on doctor_id: credentials are the audit trail for a
-- verification decision, so they outlive convenience. Hard-deleting a doctor
-- who has uploaded credentials is intentionally blocked.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.doctor_credentials (
  id                  uuid primary key default gen_random_uuid(),
  doctor_id           uuid not null references public.doctor_profiles (user_id) on delete restrict,
  credential_type     public.credential_type not null,
  document_path       text not null,
  document_name       text not null,
  verification_status public.verification_status not null default 'pending',
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint doctor_credentials_document_path_length
    check (char_length(document_path) between 3 and 1024),
  constraint doctor_credentials_document_name_length
    check (char_length(btrim(document_name)) between 1 and 255),

  -- The database itself pins the object to the doctor's own storage folder.
  -- Even a compromised client cannot register a path belonging to someone else,
  -- which closes the IDOR path between this table and Storage.
  constraint doctor_credentials_document_path_is_owned
    check (document_path like doctor_id::text || '/%'),

  -- No path traversal, no absolute paths, no double slashes.
  constraint doctor_credentials_document_path_safe
    check (
      document_path not like '%..%'
      and document_path not like '/%'
      and document_path not like '%//%'
    ),

  -- A doctor can never be the reviewer of their own credential.
  constraint doctor_credentials_reviewer_not_self
    check (reviewed_by is null or reviewed_by <> doctor_id),

  -- Any decided credential must carry a review timestamp.
  constraint doctor_credentials_decision_has_timestamp
    check (verification_status = 'pending' or reviewed_at is not null),

  -- A rejection must explain itself.
  constraint doctor_credentials_rejection_has_reason
    check (
      verification_status <> 'rejected'
      or nullif(btrim(coalesce(rejection_reason, '')), '') is not null
    ),

  constraint doctor_credentials_rejection_reason_length
    check (rejection_reason is null or char_length(rejection_reason) <= 2000)
);

comment on table public.doctor_credentials is
  'Doctor verification evidence. Stores the private Storage object path only, never document bytes.';
comment on column public.doctor_credentials.document_path is
  'Path inside the private doctor-credentials bucket, constrained to <doctor_id>/...';

-- One live credential per type per doctor. Rejected/suspended rows are retained
-- as history and are excluded from the constraint so a doctor can re-upload
-- after a rejection.
create unique index if not exists doctor_credentials_one_live_per_type
  on public.doctor_credentials (doctor_id, credential_type)
  where verification_status in ('pending', 'verified');

-- Two credential rows must never reference the same stored object.
create unique index if not exists doctor_credentials_document_path_key
  on public.doctor_credentials (document_path);

create index if not exists doctor_credentials_doctor_id_idx
  on public.doctor_credentials (doctor_id);

create index if not exists doctor_credentials_verification_status_idx
  on public.doctor_credentials (verification_status);

drop trigger if exists doctor_credentials_set_updated_at on public.doctor_credentials;
create trigger doctor_credentials_set_updated_at
  before update on public.doctor_credentials
  for each row execute function public.set_updated_at();
