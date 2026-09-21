/**
 * Server-side environment loading for scripts/.
 *
 * SECURITY: this module is only ever imported by Node scripts. It must never be
 * imported from anything under src/, because it reads SUPABASE_SECRET_KEY and
 * DATABASE_URL. Values are never logged — use redact() when you need to show a
 * connection target to the user.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..', '..');

/** Minimal .env parser. Avoids depending on dotenv's file-resolution order. */
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = parseEnvFile(path.join(projectRoot, '.env'));

/** Real process env wins over .env, so CI can override without editing files. */
export function env(key, {required = false} = {}) {
  const value = process.env[key] ?? fileEnv[key];
  if (required && (value === undefined || value === '')) {
    throw new Error(
      `Missing required environment variable ${key}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

/**
 * Renders a connection target safely: host and database only, never the
 * password. Use this in any log line that mentions the database.
 */
export function redactDatabaseUrl(urlString) {
  try {
    const u = new URL(urlString);
    return `${u.protocol}//${u.username ? '***:***@' : ''}${u.host}${u.pathname}`;
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

/** Strips anything secret-looking out of a string before it reaches a log. */
export function scrub(text) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const key of ['SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
    const value = env(key);
    if (value) out = out.split(value).join('<redacted>');
  }
  return out
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, 'sb_secret_<redacted>')
    .replace(/postgres(ql)?:\/\/[^\s"']+/g, 'postgresql://<redacted>');
}
