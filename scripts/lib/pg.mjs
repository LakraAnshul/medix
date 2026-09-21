/**
 * PostgreSQL connection helper for migrations, verification and tests.
 *
 * TLS POSTURE — equivalent to libpq `sslmode=verify-full`
 *
 *   Supabase's Postgres endpoints are not signed by a publicly-trusted CA. The
 *   chain is:
 *       *.pooler.supabase.com -> Supabase Intermediate 2021 CA -> Supabase Root 2021 CA
 *   with a self-signed root, so Node's bundled trust store rejects it outright.
 *   Verification is only possible against the pinned root in supabase/certs/.
 *
 *   This module therefore:
 *     - verifies the certificate chain against that pinned root (rejectUnauthorized)
 *     - verifies the certificate actually belongs to the host we asked for
 *       (servername drives Node's checkServerIdentity)
 *     - verifies the pinned CA file itself still matches the recorded SHA-256, so
 *       swapping the file on disk does not silently widen trust
 *     - FAILS CLOSED. If the CA is missing or the fingerprint disagrees, the
 *       connection is refused rather than downgraded. For a system that will hold
 *       medical records, a silent fallback to "encrypted but unauthenticated" is
 *       the wrong default: it is exactly the state an attacker wants.
 *
 *   The only way to relax this is PGSSL_ALLOW_UNVERIFIED=true, which prints a loud
 *   warning on every connection and exists for diagnosing a broken CA, nothing else.
 *
 * WHY WE CONNECT BY IP
 *   `pg` resolves hostnames through the OS (getaddrinfo), which dns.setServers()
 *   cannot redirect. This machine's resolver has been observed returning
 *   192.0.2.1 — a reserved RFC 5737 TEST-NET address — for Supabase hostnames, so
 *   we resolve ourselves, sanity-check the answer, and connect by address while
 *   passing `servername` so SNI and hostname verification still target the real
 *   name. Certificate verification is what makes this safe: a hijacked DNS answer
 *   cannot produce a certificate valid for the requested hostname, so it now fails
 *   the handshake instead of silently connecting somewhere else.
 *
 * SECRETS
 *   DATABASE_URL is read server-side only and never logged; see redactDatabaseUrl.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dnsPromises from 'node:dns/promises';
import pg from 'pg';
import {env, projectRoot, redactDatabaseUrl} from './env.mjs';

const FALLBACK_DNS = ['8.8.8.8', '1.1.1.1', '9.9.9.9'];

export const CA_PATH =
  env('SUPABASE_CA_CERT') || path.join(projectRoot, 'supabase', 'certs', 'prod-ca-2021.crt');
export const FINGERPRINT_PATH = path.join(
  projectRoot,
  'supabase',
  'certs',
  'ca-fingerprint.json',
);

/**
 * Address ranges that a public hostname such as *.supabase.com must never resolve
 * to. A hit means the resolver is lying (captive portal, filtering DNS, hijack),
 * so we discard the answer and ask a public resolver instead.
 */
const BOGUS_RANGES = [
  [/^0\./, 'this-network'],
  [/^10\./, 'RFC1918 private'],
  [/^127\./, 'loopback'],
  [/^169\.254\./, 'link-local'],
  [/^172\.(1[6-9]|2[0-9]|3[01])\./, 'RFC1918 private'],
  [/^192\.0\.2\./, 'RFC5737 TEST-NET-1'],
  [/^192\.168\./, 'RFC1918 private'],
  [/^198\.1[89]\./, 'benchmarking'],
  [/^198\.51\.100\./, 'RFC5737 TEST-NET-2'],
  [/^203\.0\.113\./, 'RFC5737 TEST-NET-3'],
  [/^(22[4-9]|23[0-9])\./, 'multicast'],
  [/^(24[0-9]|25[0-5])\./, 'reserved'],
];

function bogusReason(address) {
  for (const [pattern, reason] of BOGUS_RANGES) {
    if (pattern.test(address)) return reason;
  }
  return null;
}

/** Resolves an IPv4 address, rejecting implausible answers and falling back to public DNS. */
export async function resolveIPv4(hostname) {
  const notes = [];

  try {
    const {address} = await dnsPromises.lookup(hostname, {family: 4});
    const reason = bogusReason(address);
    if (!reason) return {address, via: 'os', notes};
    notes.push(`OS resolver returned ${address} (${reason}) for ${hostname}; ignoring it`);
  } catch (error) {
    notes.push(`OS resolver failed for ${hostname} (${error.code ?? error.message})`);
  }

  const resolver = new dnsPromises.Resolver({timeout: 6000, tries: 2});
  resolver.setServers(FALLBACK_DNS);
  const addresses = await resolver.resolve4(hostname);
  const usable = addresses.find((a) => !bogusReason(a));
  if (!usable) {
    throw new Error(
      `No plausible address for ${hostname} (got ${addresses.join(', ')}). ` +
        `Your DNS may be intercepted.`,
    );
  }
  notes.push(`used public DNS -> ${usable}`);
  return {address: usable, via: 'public-dns', notes};
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

function readPinnedFingerprint() {
  if (!fs.existsSync(FINGERPRINT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(FINGERPRINT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Loads the pinned CA and checks it against the recorded fingerprint.
 * Throws with actionable guidance rather than quietly disabling verification.
 */
export function loadVerifiedCa() {
  const allowUnverified = String(env('PGSSL_ALLOW_UNVERIFIED') ?? '').toLowerCase() === 'true';

  if (!fs.existsSync(CA_PATH)) {
    if (allowUnverified) {
      return {
        ca: null,
        verified: false,
        warning:
          'PGSSL_ALLOW_UNVERIFIED=true and no CA file present — the connection is ' +
          'ENCRYPTED BUT NOT AUTHENTICATED. Do not use this against real data.',
      };
    }
    throw new Error(
      `No Postgres CA certificate at ${path.relative(projectRoot, CA_PATH)}.\n` +
        `  Certificate verification cannot be performed, and this project refuses to\n` +
        `  connect without it.\n\n` +
        `  Fix it with:   npm run db:ca\n` +
        `  Or download it from the Supabase dashboard:\n` +
        `    Project Settings > Database > SSL Configuration\n` +
        `  and save it to ${path.relative(projectRoot, CA_PATH)}\n`,
    );
  }

  const pem = fs.readFileSync(CA_PATH, 'utf8');
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error(`${path.relative(projectRoot, CA_PATH)} is not a PEM certificate.`);
  }

  const cert = new crypto.X509Certificate(pem);
  const fingerprint = crypto.createHash('sha256').update(cert.raw).digest('hex');

  const pinned = readPinnedFingerprint();
  if (pinned?.sha256 && pinned.sha256 !== fingerprint) {
    throw new Error(
      `The CA file no longer matches the pinned fingerprint.\n` +
        `  expected ${pinned.sha256}\n` +
        `  found    ${fingerprint}\n\n` +
        `  Either Supabase rotated its root CA or the file was tampered with.\n` +
        `  Verify against the dashboard, then re-run: npm run db:ca\n`,
    );
  }

  if (new Date(cert.validTo) < new Date()) {
    throw new Error(`The pinned CA expired on ${cert.validTo}. Re-run: npm run db:ca`);
  }

  // Warn well before it becomes an outage.
  const daysLeft = Math.floor((new Date(cert.validTo) - new Date()) / 86400000);

  return {
    ca: pem,
    verified: true,
    fingerprint,
    daysLeft,
    warning: daysLeft < 90 ? `The pinned Postgres CA expires in ${daysLeft} day(s).` : null,
  };
}

export async function connect({applicationName = 'medix-migrate', quiet = false} = {}) {
  const raw = env('DATABASE_URL', {required: true});
  const cfg = parseDatabaseUrl(raw);

  if (!quiet) console.log(`  target : ${redactDatabaseUrl(raw)}`);

  const {address, via, notes} = await resolveIPv4(cfg.hostname);
  if (!quiet) {
    for (const note of notes) console.log(`  dns    : ${note}`);
    if (via === 'os') console.log(`  dns    : ${cfg.hostname} -> ${address}`);
  }

  const {ca, verified, fingerprint, warning} = loadVerifiedCa();

  if (!quiet) {
    console.log(
      verified
        ? `  tls    : verify-full against pinned Supabase root CA (${fingerprint.slice(0, 16)}…)`
        : '  tls    : ENCRYPTED, CERTIFICATE NOT VERIFIED',
    );
  }
  if (warning) console.warn(`  WARNING: ${warning}`);

  const client = new pg.Client({
    host: address,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: {
      // Full verification: chain must anchor in the pinned root...
      rejectUnauthorized: verified,
      ...(ca ? {ca} : {}),
      // ...and the certificate must belong to this hostname. Node's
      // checkServerIdentity uses servername in preference to host, so verification
      // targets the real name even though we dial an IP address.
      servername: cfg.hostname,
      minVersion: 'TLSv1.2',
    },
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
    application_name: applicationName,
  });

  await client.connect();
  return client;
}
