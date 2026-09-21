/**
 * Migration runner — migrations are the source of truth for the schema.
 *
 *   npm run db:migrate            apply everything pending
 *   npm run db:migrate -- --status  show what is applied / pending
 *   npm run db:migrate -- --force-checksum
 *                                 accept an edited file that was already applied
 *
 * Properties:
 *  - Each file runs inside its own transaction, so a failure leaves no partial
 *    migration behind.
 *  - A ledger table records filename + SHA-256. If an already-applied file is
 *    later edited, the run stops rather than silently drifting from the recorded
 *    schema. That is what keeps "no undocumented database changes" true.
 *  - Re-running is safe: applied files are skipped, and the SQL itself is written
 *    idempotently (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {projectRoot, scrub} from '../lib/env.mjs';
import {connect} from '../lib/pg.mjs';

const MIGRATIONS_DIR = path.join(projectRoot, 'supabase', 'migrations');

const LEDGER_DDL = `
  create table if not exists public.schema_migrations (
    filename   text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  );
  comment on table public.schema_migrations is
    'Applied migration ledger. Managed by scripts/db/migrate.mjs.';
  revoke all on public.schema_migrations from anon, authenticated;
  alter table public.schema_migrations enable row level security;
`;

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`No migrations directory at ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((filename) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      return {filename, sql, checksum: sha256(sql)};
    });
}

async function main() {
  const args = process.argv.slice(2);
  const statusOnly = args.includes('--status');
  const forceChecksum = args.includes('--force-checksum');

  const migrations = readMigrations();
  console.log(`\nmedix migrations (${migrations.length} file(s))`);

  const client = await connect();
  let failed = false;

  try {
    await client.query(LEDGER_DDL);

    const {rows} = await client.query(
      'select filename, checksum, applied_at from public.schema_migrations',
    );
    const applied = new Map(rows.map((r) => [r.filename, r]));

    if (statusOnly) {
      console.log('');
      for (const m of migrations) {
        const record = applied.get(m.filename);
        if (!record) {
          console.log(`  PENDING   ${m.filename}`);
        } else if (record.checksum !== m.checksum) {
          console.log(`  MODIFIED  ${m.filename}  (applied file differs from disk)`);
        } else {
          console.log(`  applied   ${m.filename}`);
        }
      }
      const orphans = [...applied.keys()].filter(
        (f) => !migrations.some((m) => m.filename === f),
      );
      for (const o of orphans) console.log(`  ORPHAN    ${o}  (in ledger, not on disk)`);
      console.log('');
      return;
    }

    let appliedCount = 0;

    for (const m of migrations) {
      const record = applied.get(m.filename);

      if (record) {
        if (record.checksum === m.checksum) {
          console.log(`  skip   ${m.filename}`);
          continue;
        }
        if (!forceChecksum) {
          throw new Error(
            `${m.filename} was already applied but its contents changed.\n` +
              `  Migrations are immutable once applied. Add a new migration file instead.\n` +
              `  If this change is intentional and idempotent, re-run with --force-checksum.`,
          );
        }
        console.log(`  REAPPLY ${m.filename}  (--force-checksum)`);
      }

      process.stdout.write(`  apply  ${m.filename} ... `);
      try {
        await client.query('begin');
        await client.query(m.sql);
        await client.query(
          `insert into public.schema_migrations (filename, checksum)
             values ($1, $2)
           on conflict (filename)
             do update set checksum = excluded.checksum, applied_at = now()`,
          [m.filename, m.checksum],
        );
        await client.query('commit');
        console.log('ok');
        appliedCount += 1;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        console.log('FAILED');
        console.error(`\n  ${m.filename} failed and was rolled back.`);
        console.error(`  ${scrub(error.message)}`);
        if (error.position) console.error(`  at character position ${error.position}`);
        if (error.hint) console.error(`  hint: ${scrub(error.hint)}`);
        if (error.detail) console.error(`  detail: ${scrub(error.detail)}`);
        if (error.where) console.error(`  where: ${scrub(error.where)}`);
        throw error;
      }
    }

    console.log(
      appliedCount === 0
        ? '\nNothing to do — schema is up to date.\n'
        : `\nApplied ${appliedCount} migration(s).\n`,
    );
  } catch (error) {
    failed = true;
    if (!error.__logged) console.error(`\nMigration run aborted: ${scrub(error.message)}\n`);
  } finally {
    await client.end().catch(() => {});
  }

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(scrub(String(error?.message ?? error)));
  process.exitCode = 1;
});
