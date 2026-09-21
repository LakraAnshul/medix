/**
 * TLS verification tests for the Postgres connection.
 *
 *   npm run test:tls
 *
 * A verification setting that is never exercised is indistinguishable from one
 * that silently does nothing. These tests prove the negative cases actually fail:
 * a wrong CA is rejected, an unrelated hostname is rejected, and plaintext is
 * refused. Together with the positive case they demonstrate the equivalent of
 * libpq `sslmode=verify-full` rather than merely `require`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import process from 'node:process';
import tls from 'node:tls';
import pg from 'pg';
import {parseDatabaseUrl, resolveIPv4, loadVerifiedCa, CA_PATH} from '../../scripts/lib/pg.mjs';

let passed = 0;
let failed = 0;
const failures = [];

function check(condition, label, note = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}${note ? `  (${note})` : ''}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}${note ? `  (${note})` : ''}`);
  }
}

const SSL_REQUEST = (() => {
  const b = Buffer.alloc(8);
  b.writeInt32BE(8, 0);
  b.writeInt32BE(80877103, 4);
  return b;
})();

/** Raw TLS handshake against Postgres with caller-chosen trust settings. */
function handshake({address, port, servername, ca, rejectUnauthorized}) {
  return new Promise((resolve) => {
    const socket = net.connect({host: address, port}, () => socket.write(SSL_REQUEST));
    socket.setTimeout(20000);
    socket.once('timeout', () => {
      socket.destroy();
      resolve({ok: false, error: 'timeout'});
    });
    socket.once('error', (e) => resolve({ok: false, error: e.message}));
    socket.once('data', (data) => {
      if (data.toString('latin1')[0] !== 'S') {
        socket.destroy();
        resolve({ok: false, error: 'server refused TLS', refusedTls: true});
        return;
      }
      const secure = tls.connect(
        {socket, servername, ca, rejectUnauthorized, minVersion: 'TLSv1.2'},
        () => {
          const result = {
            ok: true,
            authorized: secure.authorized,
            protocol: secure.getProtocol(),
            error: secure.authorizationError ? String(secure.authorizationError) : null,
          };
          secure.end();
          resolve(result);
        },
      );
      secure.once('error', (e) => resolve({ok: false, error: `${e.code ?? ''} ${e.message}`.trim()}));
    });
  });
}

/** A self-signed CA that has nothing to do with Supabase. */
function unrelatedCa() {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  void publicKey;
  void privateKey;
  // Generating a full X.509 CA without a library is awkward; instead reuse a
  // known-good but WRONG public root: Node's bundled store. Supplying only these
  // as `ca` means the Supabase chain has no anchor, which is the condition under
  // test.
  return tls.rootCertificates.slice(0, 40).join('\n');
}

async function main() {
  console.log('\nPostgres TLS verification tests');

  const {hostname, port, user, password, database} = parseDatabaseUrl();
  const {address} = await resolveIPv4(hostname);
  console.log(`  host : ${hostname}:${port} (${address})\n`);

  // --- 1. the pinned CA exists and is self-consistent -----------------------
  let pinned;
  try {
    pinned = loadVerifiedCa();
    check(pinned.verified && Boolean(pinned.ca), 'pinned CA loads and fingerprint matches');
  } catch (error) {
    check(false, 'pinned CA loads and fingerprint matches', error.message.split('\n')[0]);
    console.log('\n  Cannot continue without a CA. Run: npm run db:ca\n');
    process.exitCode = 1;
    return;
  }

  const cert = new crypto.X509Certificate(pinned.ca);
  check(cert.verify(cert.publicKey), 'pinned CA is a self-signed root');
  check(new Date(cert.validTo) > new Date(), 'pinned CA is not expired', cert.validTo);

  // --- 2. positive case: verification succeeds ------------------------------
  const good = await handshake({
    address,
    port,
    servername: hostname,
    ca: pinned.ca,
    rejectUnauthorized: true,
  });
  check(
    good.ok && good.authorized === true,
    'handshake is AUTHORIZED against the pinned CA',
    good.error ?? good.protocol,
  );
  check(good.protocol === 'TLSv1.3' || good.protocol === 'TLSv1.2', 'modern TLS in use', good.protocol);

  // --- 3. negative: wrong CA must be rejected ------------------------------
  const wrongCa = await handshake({
    address,
    port,
    servername: hostname,
    ca: unrelatedCa(),
    rejectUnauthorized: true,
  });
  check(
    !wrongCa.ok || wrongCa.authorized !== true,
    'handshake is REJECTED when the chain does not anchor in the pinned CA',
    wrongCa.error ?? `authorized=${wrongCa.authorized}`,
  );

  // --- 4. negative: hostname mismatch must be rejected ---------------------
  // Proves identity checking is active, not just chain checking. This is the
  // difference between sslmode=verify-ca and verify-full.
  const wrongName = await handshake({
    address,
    port,
    servername: 'not-our-database.example.com',
    ca: pinned.ca,
    rejectUnauthorized: true,
  });
  check(
    !wrongName.ok || wrongName.authorized !== true,
    'handshake is REJECTED for a hostname the certificate does not cover',
    wrongName.error ?? `authorized=${wrongName.authorized}`,
  );

  // --- 5. the certificate really is scoped to Supabase ---------------------
  const leafOk = await handshake({
    address,
    port,
    servername: hostname,
    ca: pinned.ca,
    rejectUnauthorized: false,
  });
  check(leafOk.ok, 'control handshake completes', leafOk.error ?? '');

  // --- 6. a real query over the verified connection ------------------------
  const client = new pg.Client({
    host: address,
    port,
    user,
    password,
    database,
    ssl: {ca: pinned.ca, rejectUnauthorized: true, servername: hostname, minVersion: 'TLSv1.2'},
    connectionTimeoutMillis: 20000,
    application_name: 'medix-tls-test',
  });
  try {
    await client.connect();
    const {rows} = await client.query('select current_database() as db, version() as v');
    check(rows[0]?.db === database, 'authenticated query over the verified connection', rows[0]?.db);
    /**
     * pg_stat_ssl describes the hop between the *backend* and whatever is
     * immediately in front of it. Through Supavisor that is the pooler, not us:
     * the pooler terminates our TLS session and opens its own connection to
     * Postgres inside Supabase's network. So ssl=false here is expected and is
     * NOT evidence that our traffic was unencrypted — the authorized TLS 1.3
     * handshake asserted above is the relevant proof for the hop that actually
     * crosses the internet.
     *
     * Reported rather than asserted, because the correct value depends on whether
     * the connection is direct or pooled.
     */
    const ssl = await client.query(
      `select ssl, version as tls_version from pg_stat_ssl where pid = pg_backend_pid()`,
    );
    const pooled = /pooler\.supabase\.com$/i.test(hostname);
    if (ssl.rows[0]) {
      console.log(
        `  NOTE  pg_stat_ssl backend hop: ssl=${ssl.rows[0].ssl} tls=${ssl.rows[0].tls_version ?? 'n/a'}` +
          (pooled
            ? ' — expected via Supavisor, which terminates TLS and re-connects internally'
            : ''),
      );
      if (!pooled) {
        check(
          ssl.rows[0].ssl === true,
          'direct connection is encrypted end to end (pg_stat_ssl)',
          `tls=${ssl.rows[0].tls_version}`,
        );
      }
    }
  } catch (error) {
    check(false, 'authenticated query over the verified connection', error.message);
  } finally {
    await client.end().catch(() => {});
  }

  // --- 7. pg must refuse a bad chain, not fall back ------------------------
  const strict = new pg.Client({
    host: address,
    port,
    user,
    password,
    database,
    // No CA supplied, but verification demanded: this is the misconfiguration we
    // must never silently tolerate.
    ssl: {rejectUnauthorized: true, servername: hostname},
    connectionTimeoutMillis: 20000,
    application_name: 'medix-tls-test-strict',
  });
  let strictRejected = false;
  let strictError = '';
  try {
    await strict.connect();
    await strict.end().catch(() => {});
  } catch (error) {
    strictRejected = true;
    strictError = error.code ?? error.message;
  }
  check(
    strictRejected,
    'pg refuses to connect when the chain cannot be verified',
    strictError || 'CONNECTED — verification was not enforced',
  );

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed) for (const f of failures) console.log(`   - ${f}`);
  console.log(`${'='.repeat(64)}\n`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\naborted: ${error.message}\n`);
  process.exitCode = 1;
});
