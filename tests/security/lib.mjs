/**
 * Test harness for the security suite.
 *
 * Deliberate design choice: these tests talk to the real project over the real
 * PostgREST/GoTrue/Storage APIs as real signed-in users. They do not connect as
 * `postgres` and they do not stub anything, because the thing under test *is* the
 * server-side authorization. A test that bypasses RLS to check RLS proves nothing.
 *
 * The secret key is used for exactly two things: creating confirmed test users
 * (so email confirmation does not block the suite) and cleaning up afterwards.
 */
import {createClient} from '@supabase/supabase-js';
import {env} from '../../scripts/lib/env.mjs';
import {connect} from '../../scripts/lib/pg.mjs';

export const SUPABASE_URL = env('SUPABASE_URL', {required: true});
export const PUBLISHABLE_KEY = env('SUPABASE_PUBLISHABLE_KEY', {required: true});
const SECRET_KEY = env('SUPABASE_SECRET_KEY', {required: true});

/**
 * Raw PostgREST request, bypassing supabase-js and its generated types.
 *
 * Needed for mass-assignment tests: the TypeScript Insert types omit
 * server-assigned columns, so a test written with supabase-js alone would be
 * proving the type system works, not the database. This sends the forged payload
 * over the wire exactly as a hand-rolled client would.
 */
export async function rawRequest({
  path,
  method = 'POST',
  accessToken,
  body,
  prefer = 'return=representation',
}) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}),
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return {status: response.status, ok: response.ok, payload};
}

/** Marks every row this suite creates so cleanup can find them. */
export const TEST_TAG = `sectest_${Date.now().toString(36)}`;

const noPersist = {
  auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
};

/** Anonymous client — exactly what an unauthenticated visitor has. */
export function anonClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, noPersist);
}

/** Service client — bypasses RLS. Used only for fixtures and teardown. */
export function serviceClient() {
  return createClient(SUPABASE_URL, SECRET_KEY, noPersist);
}

// ---------------------------------------------------------------- assertions

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];
const skips = [];
const sections = [];

export function section(title) {
  sections.push(title);
  console.log(`\n${title}`);
  console.log('-'.repeat(Math.min(title.length, 76)));
}

export function pass(label, note = '') {
  passed += 1;
  console.log(`  PASS  ${label}${note ? `  (${note})` : ''}`);
}

export function fail(label, note = '') {
  failed += 1;
  failures.push(`${label}${note ? ` — ${note}` : ''}`);
  console.log(`  FAIL  ${label}${note ? `  (${note})` : ''}`);
}

/**
 * Records a check that could not be executed for an environmental reason.
 * Counted separately and never reported as a pass, so the summary cannot imply
 * coverage that was not actually obtained.
 */
export function skip(label, reason) {
  skipped += 1;
  skips.push(`${label} — ${reason}`);
  console.log(`  SKIP  ${label}  (${reason})`);
}

export function check(condition, label, note = '') {
  if (condition) pass(label, note);
  else fail(label, note);
}

/** Asserts a query returned no rows (the normal shape of an RLS denial on read). */
export function expectNoRows(result, label) {
  if (result.error) {
    // A permission error is also an acceptable denial.
    check(true, label, `denied: ${result.error.code ?? result.error.message}`);
    return;
  }
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  check(rows.length === 0, label, `${rows.length} row(s) returned`);
}

/** Asserts a query returned at least one row. */
export function expectRows(result, label, min = 1) {
  if (result.error) {
    fail(label, `unexpected error: ${result.error.message}`);
    return;
  }
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  check(rows.length >= min, label, `${rows.length} row(s)`);
}

/**
 * Asserts a write was refused. Accepts either a thrown/returned error or a
 * silent zero-row outcome, because RLS denies an UPDATE by making no row match
 * rather than by erroring.
 */
export function expectWriteDenied(result, label, expectedCodes = []) {
  if (result.error) {
    const code = result.error.code ?? '';
    if (expectedCodes.length && !expectedCodes.includes(code)) {
      // Still denied, just not with the SQLSTATE we predicted. Report it.
      check(true, label, `denied with ${code} (expected ${expectedCodes.join('/')})`);
      return;
    }
    check(true, label, `denied: ${code || result.error.message.slice(0, 60)}`);
    return;
  }
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  check(rows.length === 0, label, rows.length ? 'WRITE SUCCEEDED' : 'no rows affected');
}

export function expectWriteAllowed(result, label) {
  if (result.error) {
    fail(label, `unexpected error: ${result.error.code ?? ''} ${result.error.message}`);
    return false;
  }
  pass(label);
  return true;
}

export function summary() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (failed) {
    console.log('\n  Failures:');
    for (const f of failures) console.log(`   - ${f}`);
  }
  if (skipped) {
    console.log('\n  Not verified (environmental):');
    for (const s of skips) console.log(`   - ${s}`);
  }
  console.log(`${'='.repeat(70)}\n`);
  return {passed, failed, skipped};
}

// ------------------------------------------------------------------ fixtures

const createdUserIds = [];

/**
 * Creates a confirmed user via the Admin API and returns a signed-in client.
 *
 * `userMetadata` lands in auth.users.raw_user_meta_data, which is the same field
 * a browser signUp() populates — so passing role:'admin' here exercises exactly
 * the escalation path an attacker would use.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries around GoTrue's rate limiter. Creating a dozen users back to back can
 * trip it, and it answers with an HTML gateway page rather than JSON — which
 * would otherwise surface as a confusing "Unexpected token '<'" parse error and
 * be mistaken for a test failure.
 */
async function withRetry(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const {data, error} = await operation();
    if (!error) return data;
    lastError = error;

    const transient =
      /unexpected token|doctype|rate limit|too many|timeout|fetch failed|503|504|502/i.test(
        `${error.message} ${error.status ?? ''}`,
      );
    if (!transient || attempt === attempts) break;

    const backoff = 800 * attempt;
    await sleep(backoff);
  }
  throw new Error(
    `${label} failed after retries: ${lastError?.message ?? 'unknown'} (status ${lastError?.status ?? 'n/a'})`,
  );
}

export async function createUser({label, role = 'patient', userMetadata = {}, extra = {}}) {
  const service = serviceClient();
  const email = `${TEST_TAG}_${label}@medix-security-test.invalid`;
  const password = `Test-${TEST_TAG}-${label}-9x!`;

  const created = await withRetry(`createUser(${label})`, () =>
    service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {full_name: `Test ${label}`, role, ...userMetadata},
      ...extra,
    }),
  );

  createdUserIds.push(created.user.id);

  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, noPersist);
  const signIn = await withRetry(`signIn(${label})`, () =>
    client.auth.signInWithPassword({email, password}),
  );

  // Space requests out a little; GoTrue's limiter is per-hour and unforgiving.
  await sleep(150);

  return {
    id: created.user.id,
    email,
    password,
    label,
    client,
    accessToken: signIn.session.access_token,
  };
}

/** Registers an externally created user id for teardown. */
export function trackUser(id) {
  if (id) createdUserIds.push(id);
}

export function trackedUserIds() {
  return [...createdUserIds];
}

const createdObjects = [];

/** Records a storage object so teardown can remove it through the Storage API. */
export function trackObject(bucket, path) {
  createdObjects.push({bucket, path});
}

/**
 * Teardown. Runs over a direct connection because the tables intentionally grant
 * no DELETE to application roles, and because the FK graph must be unwound in
 * dependency order — appointments and consents use ON DELETE RESTRICT so that
 * medical history cannot be silently destroyed.
 */
export async function cleanup({verbose = true} = {}) {
  // Storage first, and through the API: Supabase blocks DELETE on storage.objects
  // from SQL ("Direct deletion from storage tables is not allowed").
  if (createdObjects.length) {
    const service = serviceClient();
    const byBucket = new Map();
    for (const {bucket, path} of createdObjects) {
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(path);
    }
    for (const [bucket, paths] of byBucket) {
      await service.storage
        .from(bucket)
        .remove(paths)
        .catch(() => {});
    }
    createdObjects.length = 0;
  }

  const db = await connect({applicationName: 'medix-sectest-cleanup', quiet: true});
  try {
    // Matches every user this suite could have created, in this run or a previous
    // one that failed partway. Recovery matters: a half-cleaned run would
    // otherwise leave rows that break the next run's uniqueness assumptions.
    // @medix-security-test.invalid is a reserved-TLD address used only by this
    // suite and its probes, so matching the whole domain is safe and catches
    // anything a previously-aborted run left behind.
    const {rows} = await db.query(
      `select id from auth.users where email like '%@medix-security-test.invalid'`,
    );
    const ids = [...new Set([...createdUserIds, ...rows.map((r) => r.id)])];
    if (ids.length === 0) return;

    // audit_logs is append-only; the trigger must be lifted to purge test rows.
    await db.query('alter table public.audit_logs disable trigger audit_logs_append_only');
    try {
      await db.query(
        'delete from public.audit_logs where actor_id = any($1) or resource_id = any($1)',
        [ids],
      );
    } finally {
      await db.query('alter table public.audit_logs enable trigger audit_logs_append_only');
    }

    await db.query(
      'delete from public.appointments where patient_id = any($1) or doctor_id = any($1)',
      [ids],
    );
    await db.query(
      'delete from public.consents where patient_id = any($1) or doctor_id = any($1)',
      [ids],
    );
    await db.query('delete from public.doctor_credentials where doctor_id = any($1)', [ids]);
    await db.query('delete from public.doctor_availability where doctor_id = any($1)', [ids]);
    // profiles + patient_profiles + doctor_profiles cascade from auth.users.
    await db.query('delete from auth.users where id = any($1)', [ids]);

    createdUserIds.length = 0;
    if (verbose) console.log(`\ncleanup: removed ${ids.length} test user(s) and their rows.`);
  } finally {
    await db.end().catch(() => {});
  }
}

/** Direct connection for fixtures that must bypass the API (e.g. promoting an admin). */
export async function withDb(fn) {
  const db = await connect({applicationName: 'medix-sectest-setup', quiet: true});
  try {
    return await fn(db);
  } finally {
    await db.end().catch(() => {});
  }
}

export const futureIso = (minutesFromNow) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString();
