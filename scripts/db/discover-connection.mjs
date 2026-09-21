/**
 * Connection discovery.
 *
 * Supabase retired the IPv4 `db.<ref>.supabase.co` direct endpoint; it now only
 * publishes AAAA records, so an IPv4-only machine sees ENOTFOUND. The supported
 * IPv4 path is the Supavisor pooler, whose hostname embeds the project's region
 * (aws-<n>-<region>.pooler.supabase.com) — information that is not present in
 * DATABASE_URL.
 *
 * This script:
 *   1. confirms the project is reachable over HTTPS and the keys work,
 *   2. reports whether the direct endpoint resolves at all (A and AAAA),
 *   3. probes pooler hostnames until one accepts `postgres.<project_ref>`,
 *   4. prints a DATABASE_URL line to paste into .env.
 *
 * Session mode (port 5432) is used rather than transaction mode (6543) because
 * migrations need real transactions, `SET LOCAL`, and prepared statements.
 */
import dns from 'node:dns/promises';
import process from 'node:process';
import pg from 'pg';
import {env, redactDatabaseUrl} from '../lib/env.mjs';

const REGIONS = [
  'ap-south-1',
  'us-east-1',
  'us-west-1',
  'us-east-2',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'eu-north-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-east-1',
  'ca-central-1',
  'sa-east-1',
];
const PREFIXES = ['aws-0', 'aws-1'];

function parseDatabaseUrl() {
  const raw = env('DATABASE_URL', {required: true});
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

function projectRefFromUrl() {
  const url = env('SUPABASE_URL', {required: true});
  return new URL(url).hostname.split('.')[0];
}

async function resolveReport(host) {
  const out = {a: [], aaaa: []};
  try {
    out.a = await dns.resolve4(host);
  } catch (e) {
    out.aError = e.code;
  }
  try {
    out.aaaa = await dns.resolve6(host);
  } catch (e) {
    out.aaaaError = e.code;
  }
  return out;
}

async function checkRest(ref) {
  const key = env('SUPABASE_PUBLISHABLE_KEY', {required: true});
  const url = `${env('SUPABASE_URL', {required: true}).replace(/\/$/, '')}/rest/v1/`;
  try {
    const res = await fetch(url, {headers: {apikey: key, Authorization: `Bearer ${key}`}});
    return {ok: res.status < 500, status: res.status};
  } catch (error) {
    return {ok: false, status: 0, error: error.message};
  }
}

async function tryPooler({host, port, user, password, database}) {
  const client = new pg.Client({
    host,
    port,
    user,
    password,
    database,
    ssl: {rejectUnauthorized: false},
    connectionTimeoutMillis: 9000,
    application_name: 'medix-discover',
  });
  try {
    await client.connect();
    const {rows} = await client.query(
      'select current_user, current_database(), version() as v',
    );
    await client.end();
    return {ok: true, info: rows[0]};
  } catch (error) {
    await client.end().catch(() => {});
    return {ok: false, code: error.code, message: error.message};
  }
}

async function main() {
  const ref = projectRefFromUrl();
  const direct = parseDatabaseUrl();

  console.log(`\nproject ref : ${ref}`);
  console.log(`DATABASE_URL: ${redactDatabaseUrl(env('DATABASE_URL'))}\n`);

  const rest = await checkRest(ref);
  console.log(`[1] HTTPS API reachable : ${rest.ok ? 'yes' : 'no'} (status ${rest.status})`);
  if (rest.error) console.log(`    ${rest.error}`);

  const dnsReport = await resolveReport(direct.host);
  console.log(`[2] ${direct.host}`);
  console.log(
    `    A    : ${dnsReport.a.length ? dnsReport.a.join(', ') : `none (${dnsReport.aError})`}`,
  );
  console.log(
    `    AAAA : ${dnsReport.aaaa.length ? dnsReport.aaaa.join(', ') : `none (${dnsReport.aaaaError})`}`,
  );

  // If the direct host does resolve, prefer it.
  if (dnsReport.a.length || dnsReport.aaaa.length) {
    console.log('\n[3] Trying the direct endpoint as configured ...');
    const r = await tryPooler(direct);
    if (r.ok) {
      console.log(`    OK as ${r.info.current_user}`);
      console.log('\nExisting DATABASE_URL works. No change needed.\n');
      return;
    }
    console.log(`    failed: ${r.code ?? ''} ${r.message}`);
  }

  console.log('\n[3] Probing Supavisor pooler hosts (session mode, port 5432) ...');
  const poolerUser = `postgres.${ref}`;

  for (const prefix of PREFIXES) {
    for (const region of REGIONS) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      let addrs;
      try {
        addrs = await dns.resolve4(host);
      } catch {
        continue; // hostname does not exist for this prefix/region pair
      }
      if (!addrs.length) continue;

      const result = await tryPooler({
        host,
        port: '5432',
        user: poolerUser,
        password: direct.password,
        database: direct.database,
      });

      if (result.ok) {
        console.log(`    MATCH ${host}`);
        console.log(`      connected as ${result.info.current_user} / ${result.info.current_database}`);
        console.log(`      ${result.info.v.split(',')[0]}`);
        const encoded = encodeURIComponent(direct.password);
        console.log('\n--- put this in .env (replacing the existing DATABASE_URL) ---');
        console.log(
          `DATABASE_URL=postgresql://${poolerUser}:${encoded}@${host}:5432/${direct.database}`,
        );
        console.log('-------------------------------------------------------------\n');
        return;
      }

      // "Tenant or user not found" means right host family, wrong region.
      const hint = /tenant|not found/i.test(result.message ?? '') ? 'wrong region' : result.message;
      console.log(`    ${host.padEnd(46)} ${result.code ?? ''} ${hint}`);
    }
  }

  console.log(
    '\nNo pooler host accepted the credentials.\n' +
      'Copy the exact connection string from the Supabase dashboard:\n' +
      '  Project Settings > Database > Connection string > URI (Session pooler)\n',
  );
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
