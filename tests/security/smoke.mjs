/**
 * Connectivity smoke test. Confirms the keys work and the signup trigger fires
 * before the full suite runs, so a credential problem is not misreported as a
 * security finding.
 */
import process from 'node:process';
import {anonClient, serviceClient, createUser, cleanup, TEST_TAG} from './lib.mjs';

async function main() {
  console.log(`\nsmoke test (tag ${TEST_TAG})\n`);

  const anon = anonClient();
  const service = serviceClient();

  // 1. Anonymous read of the public directory view.
  const view = await anon.from('verified_doctors').select('*').limit(1);
  console.log(
    `  anon read verified_doctors : ${view.error ? `ERROR ${view.error.code} ${view.error.message}` : `ok (${view.data.length} rows)`}`,
  );

  // 2. Anonymous read of a protected table must be empty, not an error.
  const profiles = await anon.from('profiles').select('id').limit(1);
  console.log(
    `  anon read profiles         : ${
      profiles.error
        ? `denied ${profiles.error.code} ${profiles.error.message}`
        : `${profiles.data.length} rows (expect 0)`
    }`,
  );

  // 3. Service key can list users.
  const list = await service.auth.admin.listUsers({page: 1, perPage: 1});
  console.log(
    `  secret key admin API       : ${list.error ? `ERROR ${list.error.message}` : 'ok'}`,
  );

  // 4. Create a user and confirm the signup trigger built the profile.
  const user = await createUser({label: 'smoke', role: 'patient'});
  const {data: profile, error: profileError} = await user.client
    .from('profiles')
    .select('id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  console.log(
    `  signup trigger             : ${
      profileError
        ? `ERROR ${profileError.message}`
        : profile
          ? `ok role=${profile.role} name="${profile.full_name}"`
          : 'NO PROFILE ROW'
    }`,
  );

  const {data: patientProfile} = await user.client
    .from('patient_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  console.log(
    `  patient_profiles created   : ${patientProfile ? 'ok' : 'MISSING'}`,
  );

  await cleanup();
  console.log('');
}

main().catch(async (error) => {
  console.error(`\nsmoke test failed: ${error.message}\n`);
  await cleanup({verbose: false}).catch(() => {});
  process.exitCode = 1;
});
