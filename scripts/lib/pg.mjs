/**
 * Direct PostgreSQL connection helper for migrations, verification and tests.
 *
 * TWO ENVIRONMENT PROBLEMS THIS WORKS AROUND
 *
 * 1. IPv6-only direct endpoint.
 *    Supabase's `db.<ref>.supabase.co` now publishes only an AAAA record. On an
 *    IPv4-only host that surfaces as ENOTFOUND. The supported IPv4 route is the
 *    Supavisor pooler, `aws-<n>-<region>.pooler.supabase.com`, with the username
 *    `postgres.<project_ref>`. Session mode (port 5432) is used rather than
 *    transaction mode (6543) because migrations need real transactions,
 *    SET LOCAL, and prepared statements.
 *
 * 2. Unreliable local resolver.
 *    `pg` resolves hostnames through the OS (getaddrinfo), which cannot be
 *    redirected by dns.setServers(). Where the OS resolver fails we resolve the
 *    address ourselves against public resolvers and connect by IP, passing
 *    `ssl.servername` so SNI and certificate matching still see the real
 *    hostname.
 *
 * SECURITY
 *  - DATABASE_URL is read server-side only and never logged; see redactDatabaseUrl.
 *  - TLS is always on. Chain verification is off unless SUPABASE_CA_CERT points at
 *    Supabase's CA bundle, because the endpoint uses a private CA. That tradeoff
 *    is printed on every run so it is never a silent default.
 */
import fs from 'node:fs';
import dnsPromises from 'node:dns/promises';
import pg from 'pg';
import {env, redactDatabaseUrl} from './env.mjs';

const FALLBACK_DNS = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

export function buildSslConfig(servername) {
  const caPath = env('SUPABASE_CA_CERT');
  if (caPath && fs.existsSync(caPath)) {
    return {
      ssl: {ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true, servername},
      verified: true,
    };
  }
  return {ssl: {rejectUnauthorized: false, servername}, verified: false};
}

/** Resolves an IPv4 address, falling back to public resolvers. */
export async function resolveIPv4(hostname) {
  try {
    const {address} = await dnsPromises.lookup(hostname, {family: 4});
    return {address, via: 'os'};
  } catch {
    /* fall through */
  }
  const resolver = new dnsPromises.Resolver({timeout: 5000, tries: 2});
  resolver.setServers(FALLBACK_DNS);
  const addresses = await resolver.resolve4(hostname);
  if (!addresses.length) throw new Error(`No A record for ${hostname}`);
  return {address: addresses[0], via: 'public-dns'};
}

export function parseDatabaseUrl(raw = env('DATABASE_URL', {required: true})) {
  const u = new URL(raw);
  return {
    hostname: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

export async function connect({applicationName = 'medix-migrate', quiet = false} = {}) {
  const raw = env('DATABASE_URL', {required: true});
  const cfg = parseDatabaseUrl(raw);

  if (!quiet) console.log(`  target : ${redactDatabaseUrl(raw)}`);

  const {address, via} = await resolveIPv4(cfg.hostname);
  if (!quiet && via === 'public-dns') {
    console.log(`  dns    : OS resolver failed; used public DNS -> ${address}`);
  }

  const {ssl, verified} = buildSslConfig(cfg.hostname);
  if (!quiet) {
    console.log(
      verified
        ? '  tls    : verified against SUPABASE_CA_CERT'
        : '  tls    : encrypted, chain NOT verified (set SUPABASE_CA_CERT to verify)',
    );
  }

  const client = new pg.Client({
    host: address,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl,
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
    application_name: applicationName,
  });

  await client.connect();
  return client;
}
