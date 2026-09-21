/**
 * Schema verification — reads the live database and asserts the structural
 * security properties Phase 2 claims.
 *
 *   npm run db:verify
 *
 * This checks *structure* (is RLS on, does the constraint exist, is the bucket
 * private, was DELETE withheld). Behavioural checks — "can patient A actually
 * read patient B" — are in tests/security, which exercise the real API as real
 * users. Both are needed: structure can look right while a policy still leaks.
 */
import process from 'node:process';
import {connect} from '../lib/pg.mjs';
import {scrub} from '../lib/env.mjs';

const APP_TABLES = [
  'profiles',
  'patient_profiles',
  'doctor_profiles',
  'doctor_credentials',
  'doctor_availability',
  'appointments',
  'consents',
  'audit_logs',
];

const EXPECTED_BUCKETS = [
  'medical-reports',
  'doctor-credentials',
  'prescriptions',
  'profile-images',
];

let pass = 0;
let fail = 0;
const failures = [];

function check(ok, label, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

async function main() {
  console.log('\nmedix schema verification');
  const db = await connect({applicationName: 'medix-verify'});

  try {
    // ---------------------------------------------------------------- tables
    section('1. Tables exist');
    const {rows: tables} = await db.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const tableNames = tables.map((r) => r.table_name);
    for (const t of APP_TABLES) {
      check(tableNames.includes(t), `public.${t}`);
    }

    // Phase-2 scope: later-phase tables must NOT exist yet.
    section('2. Later-phase tables absent (scope discipline)');
    const forbidden = [
      'consultations',
      'prescriptions',
      'medical_documents',
      'medical_measurements',
      'ai_assessments',
      'embeddings',
      'documents',
      'symptoms',
    ];
    for (const t of forbidden) {
      check(!tableNames.includes(t), `public.${t} does not exist`);
    }

    // ------------------------------------------------------------------- RLS
    section('3. Row Level Security enabled on every application table');
    const {rows: rls} = await db.query(
      `select c.relname, c.relrowsecurity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname = any($1)`,
      [APP_TABLES],
    );
    const rlsMap = new Map(rls.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of APP_TABLES) {
      check(rlsMap.get(t) === true, `RLS enabled on ${t}`, `relrowsecurity=${rlsMap.get(t)}`);
    }

    // A table with RLS on but zero policies denies everything; a table with RLS
    // off but policies present silently allows everything. Report both.
    section('4. Policy counts');
    const {rows: policies} = await db.query(
      `select tablename, cmd, count(*)::int as n
         from pg_policies
        where schemaname = 'public'
        group by tablename, cmd order by tablename, cmd`,
    );
    const byTable = {};
    for (const p of policies) {
      byTable[p.tablename] ??= {};
      byTable[p.tablename][p.cmd] = p.n;
    }
    for (const t of APP_TABLES) {
      const counts = byTable[t] ?? {};
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      check(total > 0, `${t} has policies`, JSON.stringify(counts));
      console.log(`        ${t}: ${JSON.stringify(counts)}`);
    }

    section('5. No DELETE policy on any application table');
    for (const t of APP_TABLES) {
      const counts = byTable[t] ?? {};
      check(!counts.DELETE, `${t} has no DELETE policy`);
    }

    // ---------------------------------------------------------------- grants
    section('6. Privilege baseline for anon / authenticated');
    const {rows: grants} = await db.query(
      `select table_name, grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('anon','authenticated')
          and table_name = any($1)`,
      [APP_TABLES],
    );
    const grantSet = new Set(grants.map((g) => `${g.grantee}:${g.table_name}:${g.privilege_type}`));

    for (const t of APP_TABLES) {
      check(
        !grantSet.has(`authenticated:${t}:DELETE`),
        `authenticated has no DELETE on ${t}`,
      );
    }
    for (const t of APP_TABLES) {
      const anonWrites = ['INSERT', 'UPDATE', 'DELETE'].filter((p) =>
        grantSet.has(`anon:${t}:${p}`),
      );
      check(
        anonWrites.length === 0,
        `anon has no write privilege on ${t}`,
        anonWrites.join(','),
      );
    }
    check(
      !grantSet.has('authenticated:audit_logs:UPDATE'),
      'authenticated cannot UPDATE audit_logs',
    );

    // ----------------------------------------------------------- constraints
    section('7. Critical constraints present');
    const {rows: cons} = await db.query(
      `select con.conname, con.contype, rel.relname
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public'`,
    );
    const conNames = new Set(cons.map((c) => c.conname));

    const requiredConstraints = [
      ['appointments_no_double_booking', 'doctor double-booking prevented by EXCLUDE'],
      ['appointments_patient_no_overlap', 'patient double-booking prevented by EXCLUDE'],
      ['doctor_availability_no_overlap', 'availability overlap prevented by EXCLUDE'],
      ['doctor_credentials_reviewer_not_self', 'doctor cannot review own credential (CHECK)'],
      ['doctor_credentials_document_path_is_owned', 'credential path pinned to owner folder'],
      ['doctor_profiles_verifier_not_self', 'verifier cannot be the doctor'],
      ['appointments_distinct_parties', 'doctor cannot be own patient'],
      ['consents_distinct_parties', 'consent parties distinct'],
      ['consents_revocation_consistency', 'status/revoked_at cannot disagree'],
      ['patient_profiles_height_range', 'height bounded'],
      ['patient_profiles_weight_range', 'weight bounded'],
      ['doctor_profiles_consultation_fee_range', 'fee non-negative'],
      ['doctor_profiles_experience_range', 'experience non-negative'],
      ['appointments_duration_range', 'duration > 0'],
      ['appointments_fee_range', 'fee >= 0'],
      ['doctor_availability_time_order', 'end_time > start_time'],
    ];
    for (const [name, label] of requiredConstraints) {
      check(conNames.has(name), `${label} [${name}]`);
    }

    // Exclusion constraints must really be of type 'x'.
    const exclusions = cons.filter((c) => c.contype === 'x').map((c) => c.conname);
    check(
      exclusions.length >= 3,
      `at least 3 EXCLUDE constraints exist (found ${exclusions.length})`,
      exclusions.join(', '),
    );

    section('8. Unique indexes that prevent duplicates');
    const {rows: idx} = await db.query(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const idxNames = new Set(idx.map((r) => r.indexname));
    for (const [name, label] of [
      ['doctor_profiles_registration_number_key', 'registration number unique (case-insensitive)'],
      ['doctor_credentials_one_live_per_type', 'one live credential per type per doctor'],
      ['doctor_credentials_document_path_key', 'one row per stored object'],
      ['consents_one_active_per_scope', 'one active consent per (patient,doctor,scope)'],
      ['appointments_meeting_id_key', 'meeting id unique'],
    ]) {
      check(idxNames.has(name), `${label} [${name}]`);
    }
    // PK on the 1:1 tables is what makes duplicate profiles impossible.
    for (const t of ['patient_profiles', 'doctor_profiles']) {
      const pk = cons.find((c) => c.relname === t && c.contype === 'p');
      check(Boolean(pk), `${t} has a primary key (duplicate profile impossible)`);
    }

    // -------------------------------------------------------------- triggers
    section('9. Guard and audit triggers attached');
    const {rows: trg} = await db.query(
      `select t.tgname, c.relname
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and n.nspname in ('public','auth')`,
    );
    const trgNames = new Set(trg.map((r) => r.tgname));
    for (const [name, label] of [
      ['on_auth_user_created', 'signup handler on auth.users'],
      ['profiles_guard_write', 'profiles privilege guard'],
      ['doctor_profiles_guard_write', 'doctor verification guard'],
      ['doctor_credentials_guard_write', 'credential review guard'],
      ['appointments_guard_write', 'appointment booking guard'],
      ['consents_guard_write', 'consent guard'],
      ['audit_logs_guard_write', 'audit actor_id derivation'],
      ['audit_logs_append_only', 'audit append-only enforcement'],
      ['profiles_audit', 'profiles audit writer'],
      ['appointments_audit', 'appointments audit writer'],
      ['consents_audit', 'consents audit writer'],
      ['doctor_credentials_audit', 'credentials audit writer'],
      ['doctor_profiles_audit', 'doctor profile audit writer'],
    ]) {
      check(trgNames.has(name), `${label} [${name}]`);
    }

    // ------------------------------------------------------------- functions
    section('10. Security helper functions are SECURITY DEFINER with a pinned search_path');
    const {rows: fns} = await db.query(
      `select p.proname, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any($1)`,
      [
        [
          'is_admin',
          'current_app_role',
          'is_trusted_context',
          'is_verified_doctor',
          'has_active_consent',
          'handle_new_user',
          'guard_profiles_write',
          'guard_doctor_profiles_write',
          'guard_appointments_write',
          'guard_consents_write',
          'guard_audit_logs_write',
          'block_audit_log_mutation',
        ],
      ],
    );
    for (const f of fns) {
      const pinned = (f.proconfig ?? []).some((c) => c.startsWith('search_path='));
      check(
        f.prosecdef === true && pinned,
        `${f.proname} is SECURITY DEFINER with pinned search_path`,
        `secdef=${f.prosecdef} config=${JSON.stringify(f.proconfig)}`,
      );
    }

    // ------------------------------------------------------------------ view
    section('11. Public doctor directory view');
    const {rows: viewCols} = await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'verified_doctors'`,
    );
    const viewColNames = viewCols.map((c) => c.column_name);
    check(viewColNames.length > 0, 'public.verified_doctors exists');
    for (const leaky of ['registration_number', 'phone', 'date_of_birth', 'verification_status']) {
      check(!viewColNames.includes(leaky), `verified_doctors does not expose ${leaky}`);
    }

    // --------------------------------------------------------------- storage
    section('12. Storage buckets are private');
    const {rows: buckets} = await db.query(
      `select id, public, file_size_limit, allowed_mime_types
         from storage.buckets where id = any($1)`,
      [EXPECTED_BUCKETS],
    );
    const bucketMap = new Map(buckets.map((b) => [b.id, b]));
    for (const id of EXPECTED_BUCKETS) {
      const b = bucketMap.get(id);
      check(Boolean(b), `bucket ${id} exists`);
      if (b) {
        check(b.public === false, `bucket ${id} is PRIVATE`, `public=${b.public}`);
        check(
          Number(b.file_size_limit) > 0,
          `bucket ${id} has a size limit`,
          String(b.file_size_limit),
        );
        check(
          Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length > 0,
          `bucket ${id} restricts mime types`,
        );
      }
    }

    section('13. Storage policies');
    const {rows: sp} = await db.query(
      `select policyname, cmd from pg_policies
        where schemaname = 'storage' and tablename = 'objects'`,
    );
    const spNames = sp.map((r) => r.policyname);
    check(sp.length >= 20, `storage.objects has policies (found ${sp.length})`);
    for (const name of [
      'doctor_credentials_select_own',
      'doctor_credentials_select_admin',
      'medical_reports_select_own',
      'medical_reports_select_consent',
      'prescriptions_insert_doctor',
      'profile_images_insert_own',
    ]) {
      check(spNames.includes(name), `storage policy ${name}`);
    }
    // A patient must have no read path into doctor-credentials.
    check(
      !spNames.some((n) => n.startsWith('doctor_credentials') && n.includes('patient')),
      'no patient-facing policy on doctor-credentials',
    );

    // ------------------------------------------------------------ enum guard
    section('14. Role enum is closed');
    const {rows: roleVals} = await db.query(
      `select e.enumlabel from pg_enum e
         join pg_type t on t.oid = e.enumtypid
        where t.typname = 'app_role' order by e.enumsortorder`,
    );
    const labels = roleVals.map((r) => r.enumlabel);
    check(
      labels.length === 3 && labels.join(',') === 'patient,doctor,admin',
      'app_role = patient,doctor,admin only',
      labels.join(','),
    );
  } finally {
    await db.end().catch(() => {});
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`   - ${f}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nverification aborted: ${scrub(String(error?.message ?? error))}\n`);
  process.exitCode = 1;
});
