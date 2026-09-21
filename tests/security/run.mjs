/**
 * Security test suite — behavioural, against the live project.
 *
 *   npm run test:security
 *
 * Every assertion is made through the public API as a real signed-in user, using
 * the publishable key. That is the whole point: it tests the server-side controls
 * from the position of an attacker who fully controls the client.
 *
 * scripts/db/verify.mjs is the companion piece; it checks that the structures
 * exist. This file checks that they actually behave.
 */
import process from 'node:process';
import {
  TEST_TAG,
  anonClient,
  serviceClient,
  check,
  cleanup,
  createUser,
  expectNoRows,
  expectRows,
  expectWriteAllowed,
  expectWriteDenied,
  fail,
  futureIso,
  pass,
  rawRequest,
  section,
  skip,
  summary,
  trackObject,
  trackUser,
  withDb,
} from './lib.mjs';

async function main() {
  console.log(`\nmedix security suite   tag=${TEST_TAG}`);

  // Clear anything a previous failed run left behind.
  await cleanup({verbose: false}).catch(() => {});

  const anon = anonClient();
  const service = serviceClient();

  // ===========================================================================
  section('1. Signup role sanitisation (privilege escalation at registration)');
  // ===========================================================================

  // The attacker's move: ask for admin in client-controlled signup metadata.
  const escalator = await createUser({
    label: 'escalator',
    role: 'admin',
    userMetadata: {role: 'admin'},
  });
  const escalatorProfile = await escalator.client
    .from('profiles')
    .select('role')
    .eq('id', escalator.id)
    .maybeSingle();
  check(
    escalatorProfile.data?.role === 'patient',
    'signup metadata role="admin" is downgraded to patient',
    `got role=${escalatorProfile.data?.role}`,
  );

  // Case-variant bypass attempt. The allowlist lowercases before comparing, so
  // 'ADMIN' must be treated exactly like 'admin' rather than falling through some
  // case-sensitive gap.
  const weird = await createUser({
    label: 'weird',
    role: 'patient',
    userMetadata: {role: 'ADMIN'},
  });
  const weirdProfile = await weird.client
    .from('profiles')
    .select('role')
    .eq('id', weird.id)
    .maybeSingle();
  check(
    weirdProfile.data?.role === 'patient',
    'case-variant role "ADMIN" still collapses to patient',
    `got role=${weirdProfile.data?.role}`,
  );

  // The rejected request is recorded.
  await withDb(async (db) => {
    const {rows} = await db.query(
      `select count(*)::int as n from public.audit_logs
        where action = 'SIGNUP_ROLE_REQUEST_REJECTED' and actor_id = any($1)`,
      [[escalator.id, weird.id]],
    );
    check(rows[0].n >= 2, 'rejected role requests are audited', `${rows[0].n} entries`);
  });

  // A real browser signUp() — not the admin API — must behave identically.
  const browserEmail = `${TEST_TAG}_browser@medix-security-test.invalid`;
  const browserSignUp = await anon.auth.signUp({
    email: browserEmail,
    password: `Test-${TEST_TAG}-browser-9x!`,
    options: {data: {full_name: 'Browser Escalator', role: 'admin'}},
  });
  if (browserSignUp.error) {
    const message = browserSignUp.error.message ?? '';
    const environmental =
      /rate limit|email address .* is invalid|over_email_send|smtp|confirmation/i.test(message);
    if (environmental) {
      // The project has email confirmation on and uses Supabase's shared sender,
      // which is tightly rate-limited. Not a security result either way.
      //
      // Coverage note: signUp() and admin.createUser() both write the same
      // auth.users.raw_user_meta_data column, and handle_new_user() is the only
      // code that reads it. The two assertions above therefore exercise the same
      // control through the same code path.
      skip(
        'client-side signUp() cannot self-assign admin',
        `blocked by the project email sender: ${message.slice(0, 70)}`,
      );
    } else {
      fail('browser signUp with role=admin', message);
    }
  } else {
    trackUser(browserSignUp.data.user?.id);
    await withDb(async (db) => {
      const {rows} = await db.query('select role from public.profiles where id = $1', [
        browserSignUp.data.user.id,
      ]);
      check(
        rows[0]?.role === 'patient',
        'client-side signUp() cannot self-assign admin',
        `got role=${rows[0]?.role}`,
      );
    });
  }

  // ===========================================================================
  section('2. Role immutability (no self-promotion after signup)');
  // ===========================================================================

  const patientA = await createUser({label: 'patientA', role: 'patient'});
  const patientB = await createUser({label: 'patientB', role: 'patient'});

  expectWriteDenied(
    await patientA.client.from('profiles').update({role: 'admin'}).eq('id', patientA.id).select(),
    'patient cannot update own role to admin',
    ['42501'],
  );
  expectWriteDenied(
    await patientA.client.from('profiles').update({role: 'doctor'}).eq('id', patientA.id).select(),
    'patient cannot update own role to doctor',
    ['42501'],
  );

  // Confirm nothing actually changed.
  const stillPatient = await patientA.client
    .from('profiles')
    .select('role')
    .eq('id', patientA.id)
    .maybeSingle();
  check(stillPatient.data?.role === 'patient', 'role is unchanged after the attempts');

  // ===========================================================================
  section('3. Cross-patient isolation (IDOR)');
  // ===========================================================================

  expectNoRows(
    await patientA.client.from('profiles').select('*').eq('id', patientB.id),
    'patient A cannot read patient B profile',
  );
  expectNoRows(
    await patientA.client.from('patient_profiles').select('*').eq('user_id', patientB.id),
    'patient A cannot read patient B clinical profile',
  );
  // No filter at all — the classic enumeration attempt.
  const allProfiles = await patientA.client.from('profiles').select('id');
  check(
    !allProfiles.error && allProfiles.data.length === 1 && allProfiles.data[0].id === patientA.id,
    'unfiltered profiles select returns only the caller',
    allProfiles.error ? allProfiles.error.message : `${allProfiles.data?.length} row(s)`,
  );

  expectWriteDenied(
    await patientA.client
      .from('profiles')
      .update({full_name: 'Hijacked'})
      .eq('id', patientB.id)
      .select(),
    'patient A cannot update patient B profile',
  );
  expectWriteDenied(
    await patientA.client
      .from('patient_profiles')
      .update({blood_group: 'O+'})
      .eq('user_id', patientB.id)
      .select(),
    'patient A cannot update patient B clinical data',
  );

  // Writing a row for someone else, not just updating theirs.
  expectWriteDenied(
    await patientA.client
      .from('patient_profiles')
      .insert({user_id: patientB.id, blood_group: 'A+'})
      .select(),
    'patient A cannot insert a clinical profile for patient B',
  );

  // Malformed identifiers must be rejected cleanly, not crash anything.
  const malformed = await patientA.client.from('profiles').select('*').eq('id', 'not-a-uuid');
  check(
    Boolean(malformed.error) || (malformed.data ?? []).length === 0,
    'malformed UUID is handled without leaking data',
    malformed.error ? malformed.error.code : '0 rows',
  );

  // ===========================================================================
  section('4. Doctor self-verification');
  // ===========================================================================

  const doctorA = await createUser({
    label: 'doctorA',
    role: 'doctor',
    userMetadata: {
      specialization: 'Cardiology',
      qualification: 'MBBS, MD',
      registration_number: `REG-${TEST_TAG}-A`,
    },
  });
  const doctorB = await createUser({
    label: 'doctorB',
    role: 'doctor',
    userMetadata: {
      specialization: 'Neurology',
      qualification: 'MBBS, DM',
      registration_number: `REG-${TEST_TAG}-B`,
    },
  });

  const doctorAProfile = await doctorA.client
    .from('doctor_profiles')
    .select('*')
    .eq('user_id', doctorA.id)
    .maybeSingle();
  check(
    doctorAProfile.data?.verification_status === 'pending',
    'a new doctor starts unverified',
    `status=${doctorAProfile.data?.verification_status}`,
  );

  expectWriteDenied(
    await doctorA.client
      .from('doctor_profiles')
      .update({verification_status: 'verified'})
      .eq('user_id', doctorA.id)
      .select(),
    'doctor cannot mark themselves verified',
    ['42501'],
  );

  // A doctor may still edit their own descriptive fields. A non-zero fee is set
  // here so the later "fee is server-assigned" assertion is meaningful rather
  // than comparing 0 to 0.
  expectWriteAllowed(
    await doctorA.client
      .from('doctor_profiles')
      .update({bio: 'Interventional cardiology.', experience_years: 11, consultation_fee: 749.5})
      .eq('user_id', doctorA.id)
      .select(),
    'doctor can edit their own bio, experience and fee',
  );

  expectWriteDenied(
    await doctorA.client
      .from('doctor_profiles')
      .update({consultation_fee: 1})
      .eq('user_id', doctorB.id)
      .select(),
    'doctor A cannot modify doctor B profile',
  );

  // Doctor B's private profile is not readable by doctor A.
  expectNoRows(
    await doctorA.client.from('doctor_profiles').select('*').eq('user_id', doctorB.id),
    'doctor A cannot read doctor B private profile',
  );

  // ===========================================================================
  section('5. Database constraints reject invalid values');
  // ===========================================================================

  expectWriteDenied(
    await doctorA.client
      .from('doctor_profiles')
      .update({consultation_fee: -500})
      .eq('user_id', doctorA.id)
      .select(),
    'negative consultation_fee is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await doctorA.client
      .from('doctor_profiles')
      .update({experience_years: -5})
      .eq('user_id', doctorA.id)
      .select(),
    'negative experience_years is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await patientA.client
      .from('patient_profiles')
      .update({height_cm: -100})
      .eq('user_id', patientA.id)
      .select(),
    'negative height is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await patientA.client
      .from('patient_profiles')
      .update({weight_kg: -50})
      .eq('user_id', patientA.id)
      .select(),
    'negative weight is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await patientA.client
      .from('profiles')
      .update({date_of_birth: '2099-01-01'})
      .eq('id', patientA.id)
      .select(),
    'future date_of_birth is rejected',
    ['22007'],
  );
  expectWriteDenied(
    await patientA.client
      .from('profiles')
      .update({phone: 'not-a-phone'})
      .eq('id', patientA.id)
      .select(),
    'malformed phone is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await patientA.client
      .from('patient_profiles')
      .update({allergies: ['  ']})
      .eq('user_id', patientA.id)
      .select(),
    'blank array element is rejected',
    ['23514'],
  );

  // Duplicate 1:1 profile rows are impossible (primary key).
  expectWriteDenied(
    await patientA.client.from('patient_profiles').insert({user_id: patientA.id}).select(),
    'duplicate patient_profiles row is rejected',
    ['23505'],
  );
  expectWriteDenied(
    await doctorA.client
      .from('doctor_profiles')
      .insert({
        user_id: doctorA.id,
        specialization: 'Dermatology',
        qualification: 'MBBS',
        registration_number: `REG-${TEST_TAG}-DUP`,
      })
      .select(),
    'duplicate doctor_profiles row is rejected',
    ['23505'],
  );

  // Registration number is unique case-insensitively.
  expectWriteDenied(
    await doctorB.client
      .from('doctor_profiles')
      .update({registration_number: `reg-${TEST_TAG}-a`})
      .eq('user_id', doctorB.id)
      .select(),
    'duplicate registration_number (different case) is rejected',
    ['23505'],
  );

  // ===========================================================================
  section('6. Credentials: upload, isolation, and self-approval');
  // ===========================================================================

  const credPathA = `${doctorA.id}/${crypto.randomUUID()}.pdf`;
  const credInsert = await doctorA.client
    .from('doctor_credentials')
    .insert({
      doctor_id: doctorA.id,
      credential_type: 'medical_registration',
      document_path: credPathA,
      document_name: 'registration.pdf',
    })
    .select()
    .maybeSingle();
  const credentialId = credInsert.data?.id;
  expectWriteAllowed(credInsert, 'doctor can upload their own credential');
  check(
    credInsert.data?.verification_status === 'pending',
    'uploaded credential starts pending',
    `status=${credInsert.data?.verification_status}`,
  );

  // Path is pinned to the owning doctor by a CHECK constraint.
  expectWriteDenied(
    await doctorA.client
      .from('doctor_credentials')
      .insert({
        doctor_id: doctorA.id,
        credential_type: 'degree',
        document_path: `${doctorB.id}/${crypto.randomUUID()}.pdf`,
        document_name: 'stolen.pdf',
      })
      .select(),
    'credential path outside the owner folder is rejected',
    ['23514'],
  );

  // Uploading on someone else's behalf.
  expectWriteDenied(
    await doctorB.client
      .from('doctor_credentials')
      .insert({
        doctor_id: doctorA.id,
        credential_type: 'degree',
        document_path: `${doctorA.id}/${crypto.randomUUID()}.pdf`,
        document_name: 'forged.pdf',
      })
      .select(),
    'doctor B cannot upload a credential for doctor A',
    ['42501'],
  );

  expectNoRows(
    await doctorB.client.from('doctor_credentials').select('*').eq('doctor_id', doctorA.id),
    'doctor B cannot read doctor A credentials',
  );
  expectNoRows(
    await patientA.client.from('doctor_credentials').select('*'),
    'patient cannot read any doctor credentials',
  );

  // The headline case: a doctor approving their own evidence.
  if (credentialId) {
    expectWriteDenied(
      await doctorA.client
        .from('doctor_credentials')
        .update({verification_status: 'verified'})
        .eq('id', credentialId)
        .select(),
      'doctor cannot approve their own credential',
      ['42501'],
    );
  }

  // ===========================================================================
  section('7. Admin verification workflow');
  // ===========================================================================

  const admin = await createUser({label: 'admin', role: 'patient'});
  await withDb(async (db) => {
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [admin.id]);
  });
  // Re-authenticate so the session reflects the new role on the next request.
  pass('admin created via the server-side promotion path only');

  const adminRole = await admin.client
    .from('profiles')
    .select('role')
    .eq('id', admin.id)
    .maybeSingle();
  check(adminRole.data?.role === 'admin', 'promoted account reads back as admin');

  // Verification must not be possible before evidence is approved.
  expectWriteDenied(
    await admin.client
      .from('doctor_profiles')
      .update({verification_status: 'verified'})
      .eq('user_id', doctorA.id)
      .select(),
    'admin cannot verify a doctor with no approved credential',
    ['42501'],
  );

  if (credentialId) {
    expectWriteAllowed(
      await admin.client
        .from('doctor_credentials')
        .update({verification_status: 'verified'})
        .eq('id', credentialId)
        .select(),
      'admin can approve a credential',
    );

    await withDb(async (db) => {
      const {rows} = await db.query(
        'select reviewed_by, reviewed_at from public.doctor_credentials where id = $1',
        [credentialId],
      );
      check(
        rows[0]?.reviewed_by === admin.id && rows[0]?.reviewed_at !== null,
        'reviewer is stamped server-side',
        `reviewed_by=${rows[0]?.reviewed_by?.slice(0, 8)}`,
      );
    });
  }

  expectWriteAllowed(
    await admin.client
      .from('doctor_profiles')
      .update({verification_status: 'verified'})
      .eq('user_id', doctorA.id)
      .select(),
    'admin can verify a doctor once evidence is approved',
  );

  // Doctor A is now public; doctor B is not.
  const directory = await anon.from('verified_doctors').select('*');
  if (directory.error) {
    // Surface the reason rather than reporting a bare assertion failure — an
    // errored query and an empty result mean very different things.
    fail(
      'anonymous read of the public directory',
      `${directory.error.code ?? ''} ${directory.error.message}`,
    );
  }
  const listedIds = (directory.data ?? []).map((d) => d.doctor_id);
  check(
    listedIds.includes(doctorA.id),
    'verified doctor appears in the public directory',
    `${listedIds.length} listed; looking for ${doctorA.id.slice(0, 8)}`,
  );
  check(
    !listedIds.includes(doctorB.id),
    'unverified doctor is absent from the public directory',
  );
  const viewColumns = Object.keys(directory.data?.[0] ?? {});
  check(
    viewColumns.length > 0 &&
      !viewColumns.includes('registration_number') &&
      !viewColumns.includes('phone') &&
      !viewColumns.includes('date_of_birth'),
    'directory view exposes no sensitive columns',
    viewColumns.length ? viewColumns.join(',') : 'no rows returned, cannot inspect columns',
  );

  // ===========================================================================
  section('8. Availability constraints');
  // ===========================================================================

  const slotStart = futureIso(60);
  const slotEnd = futureIso(120);

  expectWriteDenied(
    await doctorA.client
      .from('doctor_availability')
      .insert({doctor_id: doctorA.id, start_time: slotEnd, end_time: slotStart})
      .select(),
    'end_time before start_time is rejected',
    ['23514'],
  );
  expectWriteDenied(
    await doctorA.client
      .from('doctor_availability')
      .insert({
        doctor_id: doctorA.id,
        start_time: futureIso(-240),
        end_time: futureIso(-180),
      })
      .select(),
    'availability entirely in the past is rejected',
    ['22007'],
  );
  expectWriteDenied(
    await doctorB.client
      .from('doctor_availability')
      .insert({doctor_id: doctorA.id, start_time: slotStart, end_time: slotEnd})
      .select(),
    'doctor B cannot publish availability for doctor A',
    ['42501'],
  );

  const availability = await doctorA.client
    .from('doctor_availability')
    .insert({doctor_id: doctorA.id, start_time: slotStart, end_time: slotEnd})
    .select()
    .maybeSingle();
  expectWriteAllowed(availability, 'doctor can publish their own availability');
  const availabilityId = availability.data?.id;

  expectWriteDenied(
    await doctorA.client
      .from('doctor_availability')
      .insert({doctor_id: doctorA.id, start_time: futureIso(90), end_time: futureIso(150)})
      .select(),
    'overlapping availability is rejected by the EXCLUDE constraint',
    ['23P01'],
  );

  // ===========================================================================
  section('9. Booking rules');
  // ===========================================================================

  expectWriteDenied(
    await patientA.client
      .from('appointments')
      .insert({
        patient_id: patientA.id,
        doctor_id: doctorB.id,
        scheduled_at: futureIso(70),
        duration_minutes: 30,
      })
      .select(),
    'cannot book an unverified doctor',
    ['42501'],
  );

  expectWriteDenied(
    await patientA.client
      .from('appointments')
      .insert({
        patient_id: patientB.id,
        doctor_id: doctorA.id,
        scheduled_at: futureIso(70),
        duration_minutes: 30,
      })
      .select(),
    'patient A cannot book on behalf of patient B',
    ['42501'],
  );

  expectWriteDenied(
    await patientA.client
      .from('appointments')
      .insert({
        patient_id: patientA.id,
        doctor_id: doctorA.id,
        scheduled_at: futureIso(-30),
        duration_minutes: 30,
      })
      .select(),
    'cannot book a time in the past',
    ['22007'],
  );

  expectWriteDenied(
    await patientA.client
      .from('appointments')
      .insert({
        patient_id: patientA.id,
        doctor_id: doctorA.id,
        scheduled_at: futureIso(600), // outside the published window
        duration_minutes: 30,
      })
      .select(),
    'cannot book outside the published availability',
    ['42501'],
  );

  expectWriteDenied(
    await patientA.client
      .from('appointments')
      .insert({
        patient_id: patientA.id,
        doctor_id: doctorA.id,
        scheduled_at: futureIso(70),
        duration_minutes: 0,
      })
      .select(),
    'zero duration is rejected',
    ['23514'],
  );

  const booking = await patientA.client
    .from('appointments')
    .insert({
      patient_id: patientA.id,
      doctor_id: doctorA.id,
      availability_id: availabilityId,
      scheduled_at: futureIso(70),
      duration_minutes: 30,
    })
    .select()
    .maybeSingle();
  expectWriteAllowed(booking, 'patient can book a verified doctor inside a published slot');

  if (booking.data) {
    const doctorFee = await withDb(async (db) => {
      const {rows} = await db.query(
        'select consultation_fee from public.doctor_profiles where user_id = $1',
        [doctorA.id],
      );
      return Number(rows[0]?.consultation_fee);
    });
    check(
      Number(booking.data.fee) === doctorFee,
      'fee is copied from the doctor profile server-side',
      `fee=${booking.data.fee} doctor=${doctorFee}`,
    );
    check(
      booking.data.status === 'pending',
      'a new booking cannot be self-confirmed',
      `status=${booking.data.status}`,
    );
    check(
      typeof booking.data.time_range === 'string' && booking.data.time_range.length > 0,
      'time_range is derived server-side',
    );

    // Patient cannot confirm their own appointment.
    expectWriteDenied(
      await patientA.client
        .from('appointments')
        .update({status: 'confirmed'})
        .eq('id', booking.data.id)
        .select(),
      'patient cannot confirm their own appointment',
      ['42501'],
    );

    // The treating doctor can.
    expectWriteAllowed(
      await doctorA.client
        .from('appointments')
        .update({status: 'confirmed'})
        .eq('id', booking.data.id)
        .select(),
      'treating doctor can confirm the appointment',
    );

    // An unrelated patient cannot see it.
    expectNoRows(
      await patientB.client.from('appointments').select('*').eq('id', booking.data.id),
      'unrelated patient cannot read the appointment',
    );
    expectNoRows(
      await doctorB.client.from('appointments').select('*').eq('id', booking.data.id),
      'unrelated doctor cannot read the appointment',
    );
    expectRows(
      await patientA.client.from('appointments').select('*').eq('id', booking.data.id),
      'the booking patient can read their appointment',
    );
    expectRows(
      await doctorA.client.from('appointments').select('*').eq('id', booking.data.id),
      'the treating doctor can read the appointment',
    );

    // Nobody may delete medical history.
    expectWriteDenied(
      await patientA.client.from('appointments').delete().eq('id', booking.data.id).select(),
      'appointments cannot be deleted by a patient',
    );
  }

  // =========================================================================
  section('10. Mass assignment over raw HTTP (types cannot be the defence)');
  // =========================================================================

  // A second, non-overlapping window so this test has a clean slot.
  const laterWindow = await doctorA.client
    .from('doctor_availability')
    .insert({doctor_id: doctorA.id, start_time: futureIso(300), end_time: futureIso(360)})
    .select()
    .maybeSingle();
  expectWriteAllowed(laterWindow, 'doctor publishes a second availability window');

  const patientE = await createUser({label: 'patientE', role: 'patient'});
  const forgedBooking = await rawRequest({
    path: 'appointments',
    accessToken: patientE.accessToken,
    body: {
      patient_id: patientE.id,
      doctor_id: doctorA.id,
      availability_id: laterWindow.data?.id,
      scheduled_at: futureIso(305),
      duration_minutes: 30,
      // Forged, server-owned columns:
      fee: 0,
      status: 'confirmed',
      time_range: '["2030-01-01 00:00+00","2030-01-01 00:01+00")',
      cancelled_by: doctorA.id,
      meeting_id: 'attacker-chosen-room',
    },
  });

  if (forgedBooking.status >= 400) {
    // Being rejected outright is also a correct outcome.
    pass('forged appointment payload is refused', `HTTP ${forgedBooking.status}`);
  } else {
    const row = Array.isArray(forgedBooking.payload)
      ? forgedBooking.payload[0]
      : forgedBooking.payload;
    const expectedFee = await withDb(async (db) => {
      const {rows} = await db.query(
        'select consultation_fee from public.doctor_profiles where user_id = $1',
        [doctorA.id],
      );
      return Number(rows[0]?.consultation_fee);
    });

    check(
      Number(row?.fee) === expectedFee,
      'forged fee=0 is overwritten with the doctor fee',
      `fee=${row?.fee} expected=${expectedFee}`,
    );
    check(
      row?.status === 'pending',
      'forged status=confirmed is forced back to pending',
      `status=${row?.status}`,
    );
    check(
      row?.meeting_id === null,
      'attacker-chosen meeting_id is discarded',
      `meeting_id=${row?.meeting_id}`,
    );
    check(
      row?.cancelled_by === null,
      'forged cancelled_by is discarded',
      `cancelled_by=${row?.cancelled_by}`,
    );
    check(
      typeof row?.time_range === 'string' && row.time_range.includes('20') &&
        !row.time_range.startsWith('["2030-01-01 00:00'),
      'forged time_range is recomputed from scheduled_at and duration',
      `time_range=${row?.time_range}`,
    );
  }

  // =========================================================================
  section('11. Double booking under concurrency');
  // =========================================================================

  // Two patients fire at the same slot simultaneously. A frontend check cannot
  // stop this; the EXCLUDE constraint must.
  //
  // The contested slot lives in its own dedicated availability window. Reusing an
  // earlier window would let both inserts collide with an *existing* appointment
  // instead of with each other, which looks like a pass-shaped failure: two
  // rejections and no winner.
  const contestWindow = await doctorA.client
    .from('doctor_availability')
    .insert({doctor_id: doctorA.id, start_time: futureIso(600), end_time: futureIso(660)})
    .select()
    .maybeSingle();
  expectWriteAllowed(contestWindow, 'doctor publishes a dedicated window for the race test');

  const contestedStart = futureIso(605);
  const patientC = await createUser({label: 'patientC', role: 'patient'});
  const patientD = await createUser({label: 'patientD', role: 'patient'});

  const contest = async (user) =>
    user.client
      .from('appointments')
      .insert({
        patient_id: user.id,
        doctor_id: doctorA.id,
        availability_id: contestWindow.data?.id,
        scheduled_at: contestedStart,
        duration_minutes: 20,
      })
      .select()
      .maybeSingle();

  const [resultC, resultD] = await Promise.all([contest(patientC), contest(patientD)]);
  const successes = [resultC, resultD].filter((r) => !r.error && r.data).length;
  const conflicts = [resultC, resultD].filter((r) => r.error?.code === '23P01').length;

  check(
    successes === 1,
    'exactly one of two simultaneous bookings succeeds',
    `${successes} succeeded`,
  );
  check(
    conflicts === 1,
    'the losing booking is refused with an exclusion violation (23P01)',
    `codes: ${[resultC, resultD].map((r) => r.error?.code ?? 'ok').join(', ')}`,
  );

  // =========================================================================
  section('12. Consent lifecycle');
  // =========================================================================

  // A doctor cannot manufacture consent.
  expectWriteDenied(
    await doctorA.client
      .from('consents')
      .insert({patient_id: patientA.id, doctor_id: doctorA.id, scope: 'medical_records'})
      .select(),
    'doctor cannot create consent on a patient behalf',
    ['42501'],
  );
  // Nor can another patient.
  expectWriteDenied(
    await patientB.client
      .from('consents')
      .insert({patient_id: patientA.id, doctor_id: doctorA.id, scope: 'medical_records'})
      .select(),
    'patient B cannot grant consent as patient A',
    ['42501'],
  );

  // Before consent, the doctor cannot read clinical data.
  expectNoRows(
    await doctorA.client.from('patient_profiles').select('*').eq('user_id', patientA.id),
    'doctor cannot read patient clinical data without consent',
  );

  const consent = await patientA.client
    .from('consents')
    .insert({patient_id: patientA.id, doctor_id: doctorA.id, scope: 'medical_records'})
    .select()
    .maybeSingle();
  expectWriteAllowed(consent, 'patient can grant consent');

  expectRows(
    await doctorA.client.from('patient_profiles').select('*').eq('user_id', patientA.id),
    'doctor can read clinical data while consent is granted',
  );

  // Duplicate active consent is prevented.
  expectWriteDenied(
    await patientA.client
      .from('consents')
      .insert({patient_id: patientA.id, doctor_id: doctorA.id, scope: 'medical_records'})
      .select(),
    'duplicate active consent is rejected',
    ['23505'],
  );

  // A doctor cannot revoke or alter consent.
  if (consent.data) {
    expectWriteDenied(
      await doctorA.client
        .from('consents')
        .update({status: 'revoked'})
        .eq('id', consent.data.id)
        .select(),
      'doctor cannot revoke the patient consent',
    );

    expectWriteAllowed(
      await patientA.client
        .from('consents')
        .update({status: 'revoked'})
        .eq('id', consent.data.id)
        .select(),
      'patient can revoke consent',
    );

    // The access path closes immediately.
    expectNoRows(
      await doctorA.client.from('patient_profiles').select('*').eq('user_id', patientA.id),
      'revoked consent closes clinical data access',
    );

    // History survives revocation.
    const history = await patientA.client
      .from('consents')
      .select('*')
      .eq('id', consent.data.id)
      .maybeSingle();
    check(
      history.data?.status === 'revoked' && Boolean(history.data?.revoked_at),
      'revocation is recorded, not deleted',
    );

    // Re-granting must not rewrite history.
    expectWriteDenied(
      await patientA.client
        .from('consents')
        .update({status: 'granted'})
        .eq('id', consent.data.id)
        .select(),
      'a revoked consent cannot be flipped back to granted',
      ['42501'],
    );

    expectWriteDenied(
      await patientA.client.from('consents').delete().eq('id', consent.data.id).select(),
      'consent history cannot be deleted',
    );
  }

  // =========================================================================
  section('13. Audit log integrity');
  // =========================================================================

  // Forging the actor.
  const forgedAudit = await patientA.client
    .from('audit_logs')
    .insert({
      actor_id: patientB.id,
      action: 'PATIENT_RECORD_ACCESSED',
      resource_type: 'profiles',
      resource_id: patientB.id,
    })
    .select()
    .maybeSingle();

  if (forgedAudit.error) {
    pass('forged actor_id is rejected outright', forgedAudit.error.code);
  } else {
    check(
      forgedAudit.data?.actor_id === patientA.id,
      'forged actor_id is overwritten with the authenticated user',
      `actor_id=${forgedAudit.data?.actor_id?.slice(0, 8)} caller=${patientA.id.slice(0, 8)}`,
    );
  }

  // Secret-bearing metadata keys are stripped.
  const sensitiveAudit = await patientA.client
    .from('audit_logs')
    .insert({
      action: 'PATIENT_RECORD_ACCESSED',
      resource_type: 'profiles',
      resource_id: patientA.id,
      metadata: {password: 'hunter2', api_key: 'sb_secret_fake', note: 'kept'},
    })
    .select()
    .maybeSingle();

  if (sensitiveAudit.error) {
    fail('audit metadata redaction', sensitiveAudit.error.message);
  } else {
    const meta = sensitiveAudit.data?.metadata ?? {};
    check(
      !('password' in meta) && !('api_key' in meta) && meta.note === 'kept',
      'secret-bearing metadata keys are stripped on write',
      JSON.stringify(meta),
    );
  }

  // Tampering with history.
  const ownLog = await patientA.client.from('audit_logs').select('id').limit(1).maybeSingle();
  if (ownLog.data) {
    expectWriteDenied(
      await patientA.client
        .from('audit_logs')
        .update({action: 'TAMPERED'})
        .eq('id', ownLog.data.id)
        .select(),
      'audit records cannot be updated by a normal user',
      ['42501'],
    );
    expectWriteDenied(
      await patientA.client.from('audit_logs').delete().eq('id', ownLog.data.id).select(),
      'audit records cannot be deleted by a normal user',
      ['42501'],
    );
  } else {
    fail('audit self-read', 'no own audit rows visible');
  }

  // Even the RLS-bypassing secret key cannot rewrite history.
  await withDb(async (db) => {
    const {rows} = await db.query('select id from public.audit_logs limit 1');
    if (!rows[0]) {
      fail('append-only enforcement', 'no audit rows to test');
      return;
    }
    try {
      await db.query(`update public.audit_logs set action = 'TAMPERED' where id = $1`, [
        rows[0].id,
      ]);
      fail('append-only enforcement', 'a direct SQL UPDATE succeeded');
    } catch (error) {
      check(
        /append-only/i.test(error.message),
        'audit_logs is append-only even over a direct connection',
        error.code,
      );
    }
  });

  expectNoRows(
    await patientA.client.from('audit_logs').select('*').eq('actor_id', patientB.id),
    'patient A cannot read patient B audit entries',
  );
  expectRows(
    await admin.client.from('audit_logs').select('*').limit(5),
    'admin can read audit entries',
  );

  // =========================================================================
  section('14. Private storage');
  // =========================================================================

  const pdf = new Blob([`%PDF-1.4\n${TEST_TAG}\n`], {type: 'application/pdf'});
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {type: 'image/png'});

  // Doctor uploads a credential into their own folder.
  const credObjectPath = `${doctorA.id}/${crypto.randomUUID()}.pdf`;
  const credUpload = await doctorA.client.storage
    .from('doctor-credentials')
    .upload(credObjectPath, pdf, {contentType: 'application/pdf'});
  if (credUpload.error) {
    fail('doctor can upload to their own credentials folder', credUpload.error.message);
  } else {
    trackObject('doctor-credentials', credObjectPath);
    pass('doctor can upload to their own credentials folder');
  }

  // Cross-tenant upload.
  const crossPath = `${doctorB.id}/${crypto.randomUUID()}.pdf`;
  const crossUpload = await doctorA.client.storage
    .from('doctor-credentials')
    .upload(crossPath, pdf, {contentType: 'application/pdf'});
  check(
    Boolean(crossUpload.error),
    'doctor A cannot upload into doctor B credentials folder',
    crossUpload.error ? 'denied' : 'UPLOAD SUCCEEDED',
  );
  if (!crossUpload.error) trackObject('doctor-credentials', crossPath);

  // A patient must not be able to upload credentials at all.
  const patientCredPath = `${patientA.id}/${crypto.randomUUID()}.pdf`;
  const patientCredUpload = await patientA.client.storage
    .from('doctor-credentials')
    .upload(patientCredPath, pdf, {contentType: 'application/pdf'});
  check(
    Boolean(patientCredUpload.error),
    'patient cannot upload into the credentials bucket',
    patientCredUpload.error ? 'denied' : 'UPLOAD SUCCEEDED',
  );
  if (!patientCredUpload.error) trackObject('doctor-credentials', patientCredPath);

  // Patient must not be able to read a credential document.
  if (!credUpload.error) {
    const patientSigned = await patientA.client.storage
      .from('doctor-credentials')
      .createSignedUrl(credObjectPath, 60);
    check(
      Boolean(patientSigned.error),
      'patient cannot obtain a signed URL for a credential document',
      patientSigned.error ? 'denied' : 'URL ISSUED',
    );

    const doctorBSigned = await doctorB.client.storage
      .from('doctor-credentials')
      .createSignedUrl(credObjectPath, 60);
    check(
      Boolean(doctorBSigned.error),
      'another doctor cannot obtain a signed URL for that document',
      doctorBSigned.error ? 'denied' : 'URL ISSUED',
    );

    const ownerSigned = await doctorA.client.storage
      .from('doctor-credentials')
      .createSignedUrl(credObjectPath, 60);
    check(!ownerSigned.error, 'the owning doctor can obtain a signed URL');

    const adminSigned = await admin.client.storage
      .from('doctor-credentials')
      .createSignedUrl(credObjectPath, 60);
    check(!adminSigned.error, 'an admin can obtain a signed URL for review');

    // Buckets must not be publicly readable.
    const publicUrl = anon.storage.from('doctor-credentials').getPublicUrl(credObjectPath)
      .data.publicUrl;
    const publicFetch = await fetch(publicUrl).catch(() => null);
    check(
      !publicFetch || publicFetch.status >= 400,
      'the credentials bucket is not publicly readable',
      publicFetch ? `HTTP ${publicFetch.status}` : 'request failed',
    );
  }

  // medical-reports cross-patient isolation.
  const reportPath = `${patientA.id}/${crypto.randomUUID()}.pdf`;
  const reportUpload = await patientA.client.storage
    .from('medical-reports')
    .upload(reportPath, pdf, {contentType: 'application/pdf'});
  if (reportUpload.error) {
    fail('patient can upload their own medical report', reportUpload.error.message);
  } else {
    trackObject('medical-reports', reportPath);
    pass('patient can upload their own medical report');

    const otherSigned = await patientB.client.storage
      .from('medical-reports')
      .createSignedUrl(reportPath, 60);
    check(
      Boolean(otherSigned.error),
      'patient B cannot access patient A medical report',
      otherSigned.error ? 'denied' : 'URL ISSUED',
    );

    // A doctor with no consent must be refused.
    const noConsentSigned = await doctorA.client.storage
      .from('medical-reports')
      .createSignedUrl(reportPath, 60);
    check(
      Boolean(noConsentSigned.error),
      'doctor without active consent cannot access the report',
      noConsentSigned.error ? 'denied' : 'URL ISSUED',
    );

    // Grant consent, then the same request should succeed.
    const reportConsent = await patientA.client
      .from('consents')
      .insert({patient_id: patientA.id, doctor_id: doctorA.id, scope: 'reports'})
      .select()
      .maybeSingle();

    if (reportConsent.error) {
      fail('grant reports consent', reportConsent.error.message);
    } else {
      const consentedSigned = await doctorA.client.storage
        .from('medical-reports')
        .createSignedUrl(reportPath, 60);
      check(
        !consentedSigned.error,
        'doctor with reports consent can access the report',
        consentedSigned.error?.message,
      );

      await patientA.client
        .from('consents')
        .update({status: 'revoked'})
        .eq('id', reportConsent.data.id);

      const revokedSigned = await doctorA.client.storage
        .from('medical-reports')
        .createSignedUrl(reportPath, 60);
      check(
        Boolean(revokedSigned.error),
        'revoking consent closes storage access too',
        revokedSigned.error ? 'denied' : 'URL ISSUED',
      );
    }
  }

  // A patient must not be able to write their own prescription.
  const prescriptionPath = `${patientA.id}/${crypto.randomUUID()}.pdf`;
  const selfPrescription = await patientA.client.storage
    .from('prescriptions')
    .upload(prescriptionPath, pdf, {contentType: 'application/pdf'});
  check(
    Boolean(selfPrescription.error),
    'patient cannot upload a prescription for themselves',
    selfPrescription.error ? 'denied' : 'UPLOAD SUCCEEDED',
  );
  if (!selfPrescription.error) trackObject('prescriptions', prescriptionPath);

  // Mime-type restriction on profile images.
  const badMimePath = `${patientA.id}/${crypto.randomUUID()}.pdf`;
  const badMime = await patientA.client.storage
    .from('profile-images')
    .upload(badMimePath, pdf, {contentType: 'application/pdf'});
  check(
    Boolean(badMime.error),
    'profile-images rejects a disallowed mime type',
    badMime.error ? 'denied' : 'UPLOAD SUCCEEDED',
  );
  if (!badMime.error) trackObject('profile-images', badMimePath);

  const avatarPath = `${patientA.id}/${crypto.randomUUID()}.png`;
  const avatar = await patientA.client.storage
    .from('profile-images')
    .upload(avatarPath, png, {contentType: 'image/png'});
  if (!avatar.error) {
    trackObject('profile-images', avatarPath);
    pass('patient can upload their own avatar');
  } else {
    fail('patient can upload their own avatar', avatar.error.message);
  }

  // Path traversal attempt.
  const traversal = await patientA.client.storage
    .from('medical-reports')
    .upload(`${patientB.id}/${crypto.randomUUID()}.pdf`, pdf, {contentType: 'application/pdf'});
  check(
    Boolean(traversal.error),
    'patient cannot write into another patient folder',
    traversal.error ? 'denied' : 'UPLOAD SUCCEEDED',
  );

  // =========================================================================
  section('15. Session and account lifecycle');
  // =========================================================================

  // Duplicate email registration.
  const duplicate = await anon.auth.signUp({
    email: patientA.email,
    password: 'Another-Password-123!',
    options: {data: {full_name: 'Duplicate'}},
  });
  // Supabase may return a masked "obfuscated" user rather than an error, to avoid
  // account enumeration. Either behaviour is acceptable; what matters is that no
  // usable session is issued. A rate-limit error would make this assertion pass
  // for the wrong reason, so that case is reported as not verified instead.
  if (/rate limit|over_email_send/i.test(duplicate.error?.message ?? '')) {
    skip(
      'duplicate email signup does not yield a session',
      'project email sender is rate-limited',
    );
  } else {
    check(
      Boolean(duplicate.error) || !duplicate.data.session,
      'duplicate email signup does not yield a session',
      duplicate.error ? duplicate.error.message.slice(0, 50) : 'no session',
    );
  }

  // Wrong password.
  const badLogin = await anonClient().auth.signInWithPassword({
    email: patientA.email,
    password: 'definitely-the-wrong-password',
  });
  check(
    Boolean(badLogin.error) && !badLogin.data.session,
    'wrong password is refused',
    badLogin.error?.message,
  );

  // A tampered JWT must fail signature verification, not merely fail to match a
  // policy. Flip one character of the signature segment and retry a request that
  // works with the genuine token.
  const genuine = await rawRequest({
    path: `profiles?select=id&id=eq.${patientA.id}`,
    method: 'GET',
    accessToken: patientA.accessToken,
    body: undefined,
    prefer: '',
  });
  check(genuine.status === 200, 'the genuine access token is accepted', `HTTP ${genuine.status}`);

  const segments = patientA.accessToken.split('.');
  if (segments.length === 3) {
    const sig = segments[2];
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    const tampered = await rawRequest({
      path: `profiles?select=id&id=eq.${patientA.id}`,
      method: 'GET',
      accessToken: [segments[0], segments[1], flipped].join('.'),
      body: undefined,
      prefer: '',
    });
    check(
      tampered.status === 401,
      'a tampered JWT signature is rejected with 401',
      `HTTP ${tampered.status}`,
    );

    // Re-signing the payload is not possible, but swapping the claims while
    // keeping the old signature must also fail.
    const forgedClaims = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')),
        sub: patientB.id,
        role: 'service_role',
      }),
    ).toString('base64url');
    const swapped = await rawRequest({
      path: `profiles?select=id`,
      method: 'GET',
      accessToken: [segments[0], forgedClaims, sig].join('.'),
      body: undefined,
      prefer: '',
    });
    check(
      swapped.status === 401,
      'swapping JWT claims (sub / role=service_role) is rejected with 401',
      `HTTP ${swapped.status}`,
    );
  } else {
    fail('JWT tamper test', 'access token is not a three-segment JWT');
  }

  // Sign out invalidates the client session.
  const disposable = await createUser({label: 'disposable', role: 'patient'});
  await disposable.client.auth.signOut();
  const afterSignOut = await disposable.client.from('profiles').select('id');
  check(
    Boolean(afterSignOut.error) || (afterSignOut.data ?? []).length === 0,
    'a signed-out client can no longer read its profile',
    afterSignOut.error ? afterSignOut.error.code : `${afterSignOut.data?.length} rows`,
  );

  // Deleting a user with no history cascades the profile away.
  const deletable = await createUser({label: 'deletable', role: 'patient'});
  const {error: deleteError} = await service.auth.admin.deleteUser(deletable.id);
  if (deleteError) {
    fail('auth user with no history can be deleted', deleteError.message);
  } else {
    pass('auth user with no history can be deleted');
    await withDb(async (db) => {
      const {rows} = await db.query('select count(*)::int as n from public.profiles where id = $1', [
        deletable.id,
      ]);
      check(rows[0].n === 0, 'deleting the auth user cascades the profile (no orphan)');
    });
  }

  // Deleting a user WITH medical history is intentionally blocked by RESTRICT.
  const {error: restrictedDelete} = await service.auth.admin.deleteUser(patientA.id);
  check(
    Boolean(restrictedDelete),
    'deleting a patient with appointments is blocked (history is retained)',
    restrictedDelete ? 'blocked' : 'DELETE SUCCEEDED',
  );

  // =========================================================================
  section('16. Anonymous access surface');
  // =========================================================================

  for (const table of [
    'profiles',
    'patient_profiles',
    'doctor_profiles',
    'doctor_credentials',
    'appointments',
    'consents',
    'audit_logs',
  ]) {
    const result = await anon.from(table).select('*').limit(1);
    check(
      Boolean(result.error) || (result.data ?? []).length === 0,
      `anonymous read of ${table} yields nothing`,
      result.error ? result.error.code : `${result.data?.length} rows`,
    );
  }

  for (const table of ['profiles', 'appointments', 'consents', 'audit_logs']) {
    const result = await anon.from(table).insert({}).select();
    check(Boolean(result.error), `anonymous insert into ${table} is refused`, result.error?.code);
  }

  // Open availability of a verified doctor is public by design.
  expectRows(
    await anon.from('doctor_availability').select('*').eq('doctor_id', doctorA.id),
    'anonymous visitors can see open slots of verified doctors',
  );

  const {failed} = summary();

  await cleanup();

  if (failed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`\nsuite aborted: ${String(error?.stack ?? error)}\n`);
  await cleanup({verbose: true}).catch(() => {});
  process.exitCode = 1;
});
