-- ============================================================================
-- 009_create_audit_logs.sql
-- Append-only audit trail.
--
-- SECURITY:
--   * actor_id is NEVER trusted from the client. public.guard_audit_logs_write()
--     overwrites it with auth.uid() whenever a session exists, so a user cannot
--     forge an entry attributed to somebody else.
--   * The table is append-only. There are no UPDATE or DELETE policies, UPDATE
--     and DELETE privileges are revoked from anon/authenticated, AND a trigger
--     raises on any UPDATE/DELETE — which also blocks the RLS-bypassing secret
--     key. Retention purges therefore require an explicit, deliberate
--     `ALTER TABLE ... DISABLE TRIGGER audit_logs_append_only`.
--   * metadata keys that commonly carry secrets are stripped on write, so a
--     careless caller cannot persist a password or token here.
--
-- WHY actor_id HAS NO FOREIGN KEY
--   An audit trail must not be coupled to the lifecycle of what it describes.
--   Two concrete reasons:
--     1. ON DELETE SET NULL would issue an UPDATE against this table, which the
--        append-only trigger rejects — deleting any user would become impossible.
--     2. ON DELETE RESTRICT would mean "this user was audited" blocks erasure.
--   Storing the bare UUID plus an actor_role snapshot preserves the trail
--   verbatim even after the account is gone. resource_id is unreferenced for the
--   same reason.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid,
  actor_role    public.app_role,
  action        text not null,
  resource_type text not null,
  resource_id   uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),

  -- SCREAMING_SNAKE_CASE action names, e.g. APPOINTMENT_CREATED.
  constraint audit_logs_action_format
    check (action ~ '^[A-Z][A-Z0-9_]{2,63}$'),

  -- lower_snake_case resource names, e.g. appointments.
  constraint audit_logs_resource_type_format
    check (resource_type ~ '^[a-z][a-z0-9_]{2,63}$'),

  constraint audit_logs_metadata_is_object
    check (jsonb_typeof(metadata) = 'object'),

  -- Bounded so the audit trail cannot be used as bulk storage.
  constraint audit_logs_metadata_size
    check (char_length(metadata::text) <= 8192)
);

comment on table public.audit_logs is
  'Append-only audit trail. actor_id is derived from auth.uid(); UPDATE/DELETE are blocked by trigger.';
comment on column public.audit_logs.actor_id is
  'Server-derived from auth.uid(). Intentionally has no FK so the trail survives account deletion.';
comment on column public.audit_logs.actor_role is
  'Snapshot of the actor role at write time; remains meaningful after the profile is gone.';
comment on column public.audit_logs.metadata is
  'Non-sensitive context only. Secret-bearing keys are stripped on insert.';

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);

create index if not exists audit_logs_resource_idx
  on public.audit_logs (resource_type, resource_id, created_at desc);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
