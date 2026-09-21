-- ============================================================================
-- 013_fix_public_doctor_directory.sql
--
-- PROBLEM
--   Migration 011 published the public doctor directory as an owner's-rights
--   view (`security_invoker = off`), relying on the view running as its owner so
--   it could project a narrow, non-sensitive column set while bypassing RLS on
--   profiles/doctor_profiles.
--
--   That assumption does not hold on this platform. Inspecting the live database
--   shows the view carries `reloptions = {security_invoker=true}` even though the
--   migration asked for `off` — Supabase normalises views in exposed schemas to
--   invoker's rights, which is a sensible platform default because
--   owner's-rights views are a well-known privilege-escalation footgun.
--
--   The consequence was a real functional break, caught by the security suite:
--   an anonymous visitor reading public.verified_doctors got
--   `42501 permission denied for table doctor_profiles`, because with invoker's
--   rights the view needs the *caller's* privileges on the base tables — and
--   `anon` deliberately has none.
--
-- WHY NOT JUST RE-ASSERT security_invoker = off
--   Because it is not ours to control, and a security boundary that depends on a
--   platform default we cannot pin is not a boundary. It could flip again.
--
-- WHY NOT COLUMN-LEVEL GRANTS ON THE BASE TABLES
--   That was the other candidate: grant anon/authenticated SELECT on only the
--   safe columns and add a row policy for verified doctors. It fails for
--   `authenticated`, who already hold table-wide SELECT on profiles (migration
--   011) so they can read every column. Adding a row policy covering doctor rows
--   would therefore expose those doctors' date_of_birth and phone. Narrowing the
--   existing grant to a column list would be invasive and easy to get wrong.
--
-- THE FIX
--   Move the privilege boundary from the view into a SECURITY DEFINER function.
--   The function bypasses RLS internally (it is owned by the table owner) and
--   returns only whitelisted columns, so the projection *is* the security
--   boundary. The view becomes a thin wrapper over it and keeps working for
--   `.from('verified_doctors')` regardless of how security_invoker is set —
--   under invoker's rights the caller merely needs EXECUTE on the function,
--   which is granted.
--
--   Net effect: identical API surface, no dependency on a platform default.
-- ============================================================================

set local search_path = public, extensions, pg_catalog;

-- The view depends on the function's return type, so drop it before redefining.
drop view if exists public.verified_doctors;

create or replace function public.list_verified_doctors()
returns table (
  doctor_id        uuid,
  full_name        text,
  avatar_url       text,
  specialization   text,
  qualification    text,
  experience_years integer,
  consultation_fee numeric(10, 2),
  bio              text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.user_id,
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
$$;

comment on function public.list_verified_doctors() is
  'Public doctor directory. SECURITY DEFINER so the column projection is the security boundary: it returns only non-sensitive fields and only verified doctors. Deliberately excludes registration_number, phone, date_of_birth and the verification audit columns.';

revoke all on function public.list_verified_doctors() from public;
grant execute on function public.list_verified_doctors() to anon, authenticated;

-- Thin wrapper so existing client code keeps using .from('verified_doctors').
-- Safe under either security_invoker setting: with invoker's rights the caller
-- only needs EXECUTE on the function above, not access to the base tables.
create view public.verified_doctors as
select * from public.list_verified_doctors();

comment on view public.verified_doctors is
  'Public directory of verified doctors. Wraps public.list_verified_doctors(); carries no reliance on the view''s security_invoker setting.';

revoke all on public.verified_doctors from anon, authenticated;
grant select on public.verified_doctors to anon, authenticated;
