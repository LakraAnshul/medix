/**
 * Post-build secret scan.
 *
 *   npm run build && npm run check:bundle
 *
 * vite.config.ts already refuses to build if a server-side secret is exposed
 * through a VITE_ variable. This is the independent check on the actual output:
 * it greps every emitted asset for the real secret values and for anything
 * shaped like a secret. Belt and braces, because a leak here is unrecoverable —
 * once a key ships in a bundle it must be rotated, not patched.
 *
 * Exits non-zero on any finding, so it is safe to wire into CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {env, projectRoot} from '../lib/env.mjs';

const DIST = path.join(projectRoot, 'dist');

/** Exact values that must never appear in client output. */
const FORBIDDEN_VALUES = [
  ['SUPABASE_SECRET_KEY', env('SUPABASE_SECRET_KEY')],
  ['DATABASE_URL', env('DATABASE_URL')],
].filter(([, value]) => typeof value === 'string' && value.length > 0);

/** Shapes that indicate a secret regardless of which project it belongs to. */
const FORBIDDEN_PATTERNS = [
  ['supabase secret key', /sb_secret_[A-Za-z0-9_-]{8,}/g],
  ['postgres connection string', /postgres(?:ql)?:\/\/[^\s"'`)]{8,}/g],
  ['service_role JWT', /"role"\s*:\s*"service_role"/g],
  ['private key block', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g],
];

/** The database password on its own, extracted from DATABASE_URL. */
function databasePassword() {
  const raw = env('DATABASE_URL');
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(new URL(raw).password);
    return decoded.length >= 6 ? decoded : null;
  } catch {
    return null;
  }
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt', '.svg', '.webmanifest',
]);

function main() {
  console.log('\nbundle secret scan');

  if (!fs.existsSync(DIST)) {
    console.error(`  no dist/ directory at ${DIST}. Run "npm run build" first.\n`);
    process.exitCode = 1;
    return;
  }

  const files = walk(DIST);
  const textFiles = files.filter((f) => TEXT_EXTENSIONS.has(path.extname(f).toLowerCase()));
  console.log(`  scanning ${textFiles.length} text asset(s) of ${files.length} total`);

  const password = databasePassword();
  const findings = [];

  for (const file of textFiles) {
    const relative = path.relative(projectRoot, file);
    const content = fs.readFileSync(file, 'utf8');

    for (const [name, value] of FORBIDDEN_VALUES) {
      if (content.includes(value)) {
        findings.push(`${relative}: contains the literal value of ${name}`);
      }
    }

    if (password && content.includes(password)) {
      findings.push(`${relative}: contains the database password`);
    }

    for (const [label, pattern] of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        findings.push(`${relative}: matches ${label}`);
      }
    }
  }

  // Positive control: the publishable key *should* be present. If it is missing,
  // the env allowlist is broken and the app will not work at runtime.
  const publishable = env('SUPABASE_PUBLISHABLE_KEY');
  const publishablePresent =
    !publishable ||
    textFiles.some((f) => fs.readFileSync(f, 'utf8').includes(publishable));

  if (findings.length === 0) {
    console.log('  PASS  no secret values or secret-shaped strings found');
  } else {
    console.log(`  FAIL  ${findings.length} finding(s):`);
    for (const f of findings) console.log(`        ${f}`);
  }

  console.log(
    publishablePresent
      ? '  PASS  publishable key is present (client config reached the bundle)'
      : '  WARN  publishable key not found in the bundle — check the vite.config.ts allowlist',
  );

  console.log('');
  if (findings.length > 0) process.exitCode = 1;
}

main();
