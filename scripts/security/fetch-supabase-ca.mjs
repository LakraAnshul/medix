/**
 * Captures and validates the Supabase Postgres root CA.
 *
 *   npm run db:ca            capture, validate, and write the CA file
 *   npm run db:ca -- --check validate the existing file against the live server
 *
 * WHY THIS TOOL EXISTS
 *   Supabase's Postgres endpoints do NOT use a publicly-trusted certificate. The
 *   chain is:
 *       *.pooler.supabase.com
 *         -> Supabase Intermediate 2021 CA
 *           -> Supabase Root 2021 CA   (self-signed)
 *   Node's bundled root store therefore rejects it with SELF_SIGNED_CERT_IN_CHAIN,
 *   and certificate verification is impossible until that root is pinned locally.
 *
 *   Supabase serves the root certificate from the project dashboard
 *   (Settings > Database > SSL Configuration), which is an authenticated download
 *   with no stable public URL, so it cannot be fetched unattended.
 *
 * HOW TRUST IS ESTABLISHED
 *   This tool reads the chain the server presents, then refuses to write anything
 *   until it has checked, locally and cryptographically:
 *     1. the root is self-signed (its own public key verifies its signature);
 *     2. the intermediate is genuinely signed by that root;
 *     3. the leaf is genuinely signed by that intermediate;
 *     4. the leaf's SAN actually covers the host we are connecting to;
 *     5. nothing in the chain is expired;
 *     6. the root matches the expected subject, serial and validity window.
 *
 *   Steps 1-5 prove the chain is internally consistent. They do NOT by themselves
 *   prove the root is Supabase's — an attacker able to intercept this one
 *   bootstrap connection could present a self-consistent chain of their own. That
 *   is why the tool prints the SHA-256 fingerprint and asks you to compare it once
 *   against the dashboard download. After that the fingerprint is pinned in
 *   supabase/certs/ca-fingerprint.json and every later run re-checks it, so the
 *   window of trust is a single, explicit, human-verified moment.
 *
 *   Postgres calls this same trade-off `sslmode=verify-full` plus `sslrootcert`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import tls from 'node:tls';
import {env, projectRoot} from '../lib/env.mjs';
import {parseDatabaseUrl, resolveIPv4, CA_PATH, FINGERPRINT_PATH} from '../lib/pg.mjs';

/**
 * Expected identity of the Supabase Root 2021 CA. These are published properties
 * of a public certificate, not secrets. A mismatch means either Supabase rotated
 * its root or something is intercepting the connection — both must be looked at
 * by a human, so the tool stops either way.
 */
const EXPECTED_ROOT = {
  subjectCN: 'Supabase Root 2021 CA',
  organisation: 'Supabase Inc',
  serialNumber: '6CBC4CA1DEB63F692D0A2024C67289C2D13D54F6',
};

const SSL_REQUEST = (() => {
  const buf = Buffer.alloc(8);
  buf.writeInt32BE(8, 0);
  buf.writeInt32BE(80877103, 4); // magic: SSLRequest
  return buf;
})();

/**
 * Performs the Postgres TLS upgrade and returns the presented chain.
 *
 * Postgres does not begin with TLS. The client sends an SSLRequest packet over
 * plaintext TCP and the server answers with a single byte: 'S' to proceed, 'N' to
 * refuse. Only then can the socket be wrapped.
 */
async function fetchChain({hostname, port}) {
  const {address} = await resolveIPv4(hostname);

  return new Promise((resolve, reject) => {
    const socket = net.connect({host: address, port}, () => socket.write(SSL_REQUEST));
    socket.setTimeout(20000);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error(`timed out connecting to ${hostname}:${port}`));
    });
    socket.once('error', reject);

    socket.once('data', (data) => {
      const answer = data.toString('latin1')[0];
      if (answer !== 'S') {
        socket.destroy();
        reject(
          new Error(
            `server refused TLS (answered '${answer}'). ` +
              `Refusing to continue: an unencrypted database connection is not acceptable.`,
          ),
        );
        return;
      }

      // rejectUnauthorized is false for this one bootstrap read only. We cannot
      // verify a chain before we possess its root; the checks below and the
      // fingerprint comparison are what make this safe.
      const secure = tls.connect(
        {socket, servername: hostname, rejectUnauthorized: false},
        () => {
          const chain = [];
          const seen = new Set();
          let cert = secure.getPeerCertificate(true);
          while (cert && cert.raw && !seen.has(cert.serialNumber)) {
            seen.add(cert.serialNumber);
            chain.push(new crypto.X509Certificate(cert.raw));
            if (!cert.issuerCertificate || cert.issuerCertificate === cert) break;
            cert = cert.issuerCertificate;
          }
          const protocol = secure.getProtocol();
          secure.end();
          resolve({chain, protocol, address});
        },
      );
      secure.once('error', reject);
    });
  });
}

const sha256 = (cert) => crypto.createHash('sha256').update(cert.raw).digest('hex');
const fmtFingerprint = (hex) => (hex.match(/../g) ?? []).join(':').toUpperCase();
const cn = (subject) => (subject.match(/CN=(.*)/) ?? [])[1]?.trim() ?? subject;

function validateChain(chain, hostname) {
  const problems = [];
  const now = new Date();

  if (chain.length < 2) {
    problems.push(`expected a leaf plus at least one CA, got ${chain.length} certificate(s)`);
    return {problems, root: null, leaf: chain[0] ?? null};
  }

  const leaf = chain[0];
  const root = chain[chain.length - 1];

  // 5. validity windows
  for (const cert of chain) {
    if (new Date(cert.validFrom) > now) problems.push(`${cn(cert.subject)} is not yet valid`);
    if (new Date(cert.validTo) < now) problems.push(`${cn(cert.subject)} has EXPIRED`);
  }

  // 1. the root must be self-signed
  if (!root.verify(root.publicKey)) {
    problems.push(`root "${cn(root.subject)}" does not verify against its own key`);
  }

  // 2 + 3. every certificate must be signed by the next one up
  for (let i = 0; i < chain.length - 1; i += 1) {
    const child = chain[i];
    const parent = chain[i + 1];
    if (!child.verify(parent.publicKey)) {
      problems.push(
        `signature check failed: "${cn(child.subject)}" is not signed by "${cn(parent.subject)}"`,
      );
    }
    if (child.issuer !== parent.subject) {
      problems.push(`issuer mismatch: "${cn(child.subject)}" -> "${cn(parent.subject)}"`);
    }
  }

  // 4. the leaf must actually be for this host
  if (leaf.checkHost(hostname) === undefined) {
    problems.push(`leaf does not cover host ${hostname} (SAN: ${leaf.subjectAltName})`);
  }

  // 6. the root must look like the Supabase root we expect
  if (cn(root.subject) !== EXPECTED_ROOT.subjectCN) {
    problems.push(
      `unexpected root CN: got "${cn(root.subject)}", expected "${EXPECTED_ROOT.subjectCN}"`,
    );
  }
  if (!root.subject.includes(EXPECTED_ROOT.organisation)) {
    problems.push(`unexpected root organisation: ${root.subject.replace(/\n/g, ' ')}`);
  }
  if (root.serialNumber !== EXPECTED_ROOT.serialNumber) {
    problems.push(
      `unexpected root serial: got ${root.serialNumber}, expected ${EXPECTED_ROOT.serialNumber}`,
    );
  }

  return {problems, root, leaf};
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const {hostname, port} = parseDatabaseUrl();

  console.log('\nSupabase Postgres CA');
  console.log(`  host : ${hostname}:${port}`);

  const {chain, protocol, address} = await fetchChain({hostname, port});
  console.log(`  addr : ${address}`);
  console.log(`  tls  : ${protocol}`);
  console.log(`  chain: ${chain.length} certificate(s)\n`);

  chain.forEach((cert, i) => {
    const label = i === 0 ? 'leaf' : i === chain.length - 1 ? 'root' : 'intermediate';
    console.log(`  [${i}] ${label}`);
    console.log(`      subject : ${cn(cert.subject)}`);
    console.log(`      issuer  : ${cn(cert.issuer)}`);
    console.log(`      valid   : ${cert.validFrom}  ->  ${cert.validTo}`);
    if (cert.subjectAltName) console.log(`      san     : ${cert.subjectAltName}`);
    console.log(`      serial  : ${cert.serialNumber}`);
    console.log(`      sha256  : ${fmtFingerprint(sha256(cert))}`);
  });

  const {problems, root} = validateChain(chain, hostname);

  console.log('\n  chain validation');
  if (problems.length === 0) {
    console.log('    PASS  self-signed root, valid signatures end to end, SAN covers the host,');
    console.log('          nothing expired, root identity matches the expected Supabase root.');
  } else {
    for (const p of problems) console.log(`    FAIL  ${p}`);
    console.error(
      '\nRefusing to write a CA file from a chain that did not validate.\n' +
        'Download the certificate manually instead:\n' +
        '  Supabase Dashboard > Project Settings > Database > SSL Configuration\n' +
        `and save it to ${path.relative(projectRoot, CA_PATH)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const rootFingerprint = sha256(root);
  const rootPem = root.toString();

  // --check mode: compare what is on disk against what the server presents.
  if (checkOnly) {
    if (!fs.existsSync(CA_PATH)) {
      console.error(`\n  FAIL  no CA file at ${path.relative(projectRoot, CA_PATH)}\n`);
      process.exitCode = 1;
      return;
    }
    const onDisk = new crypto.X509Certificate(fs.readFileSync(CA_PATH));
    const matches = sha256(onDisk) === rootFingerprint;
    console.log(
      matches
        ? '\n    PASS  the pinned CA file matches the root the server presents\n'
        : '\n    FAIL  the pinned CA file does NOT match the root the server presents\n',
    );
    if (!matches) process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(CA_PATH), {recursive: true});
  fs.writeFileSync(CA_PATH, rootPem, 'utf8');

  fs.writeFileSync(
    FINGERPRINT_PATH,
    `${JSON.stringify(
      {
        comment:
          'Pinned Supabase Postgres root CA. Verified on every connection. ' +
          'Compare sha256 against Dashboard > Settings > Database > SSL Configuration.',
        subject: cn(root.subject),
        serialNumber: root.serialNumber,
        validFrom: root.validFrom,
        validTo: root.validTo,
        sha256: rootFingerprint,
        capturedFrom: hostname,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\n  wrote ${path.relative(projectRoot, CA_PATH)}`);
  console.log(`  wrote ${path.relative(projectRoot, FINGERPRINT_PATH)}`);
  console.log('\n  ACTION REQUIRED — confirm this fingerprint once:');
  console.log(`    ${fmtFingerprint(rootFingerprint)}`);
  console.log(
    '\n  Open Supabase Dashboard > Project Settings > Database > SSL Configuration,\n' +
      '  download the certificate, and check it matches. Until you do, trust rests on\n' +
      '  this single bootstrap connection having been clean.\n',
  );
}

main().catch((error) => {
  console.error(`\nfailed: ${error.message}\n`);
  process.exitCode = 1;
});
