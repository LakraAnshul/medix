/**
 * The only supported way to create an administrator.
 *
 *   npm run admin:promote -- --email person@example.com --confirm
 *   npm run admin:promote -- --email person@example.com --demote --confirm
 *   npm run admin:promote -- --list
 *
 * WHY THIS IS A SCRIPT AND NOT A FEATURE
 *   No client path can produce an admin. handle_new_user() maps any requested
 *   role other than 'doctor' to 'patient', and guard_profiles_write() rejects a
 *   role change from any session that is not already an admin. Promotion
 *   therefore requires a direct database connection, which requires DATABASE_URL
 *   — a credential that only exists on the operator's machine and never reaches
 *   the browser.
 *
 *   The privileged context is recognised by the guard trigger as
 *   `auth.uid() IS NULL`, which is only reachable here because `anon` holds no
 *   write privilege on any table.
 *
 * The change is written inside a transaction and recorded in audit_logs.
 */
import process from 'node:process';
import {connect} from '../lib/pg.mjs';
import {scrub} from '../lib/env.mjs';

function parseArgs(argv) {
  const args = {email: null, demote: false, confirm: false, list: false};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--email') args.email = (argv[i + 1] ?? '').trim().toLowerCase();
    else if (arg.startsWith('--email=')) args.email = arg.slice(8).trim().toLowerCase();
    else if (arg === '--demote') args.demote = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--list') args.list = true;
  }
  return args;
}

function usage() {
  console.log(
    [
      '',
      'Usage:',
      '  npm run admin:promote -- --list',
      '  npm run admin:promote -- --email person@example.com --confirm',
      '  npm run admin:promote -- --email person@example.com --demote --confirm',
      '',
      'The account must already exist (sign up through the app first).',
      '--confirm is required: this grants full administrative access.',
      '',
    ].join('\n'),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.list && !args.email) {
    usage();
    process.exitCode = 1;
    return;
  }

  const db = await connect({applicationName: 'medix-admin'});

  try {
    if (args.list) {
      const {rows} = await db.query(
        `select p.id, p.full_name, u.email, p.updated_at
           from public.profiles p
           join auth.users u on u.id = p.id
          where p.role = 'admin'
          order by p.updated_at desc`,
      );
      console.log(`\n${rows.length} administrator(s):`);
      for (const r of rows) {
        console.log(`  ${r.email.padEnd(36)} ${r.full_name}  (${r.id})`);
      }
      console.log('');
      return;
    }

    const {rows: found} = await db.query(
      `select u.id, u.email, u.email_confirmed_at, p.role, p.full_name
         from auth.users u
         left join public.profiles p on p.id = u.id
        where lower(u.email) = $1`,
      [args.email],
    );

    if (found.length === 0) {
      console.error(
        `\nNo account found for that email address.\n` +
          `Sign up through the app first, then run this again.\n`,
      );
      process.exitCode = 1;
      return;
    }

    const user = found[0];
    const targetRole = args.demote ? 'patient' : 'admin';

    if (!user.role) {
      console.error(
        `\nThat auth user has no profile row, which should not happen.\n` +
          `Sign in once to trigger the self-heal path, then retry.\n`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(`\n  account : ${user.email}`);
    console.log(`  name    : ${user.full_name}`);
    console.log(`  id      : ${user.id}`);
    console.log(`  role    : ${user.role} -> ${targetRole}`);
    if (!user.email_confirmed_at) console.log('  note    : email is not confirmed');

    if (user.role === targetRole) {
      console.log(`\nAlready ${targetRole}. Nothing to do.\n`);
      return;
    }

    if (!args.confirm) {
      console.log(
        `\nRefusing to act without --confirm.` +
          (targetRole === 'admin'
            ? ' An admin can read every patient record and approve doctors.'
            : '') +
          `\nRe-run with --confirm to apply.\n`,
      );
      process.exitCode = 1;
      return;
    }

    if (args.demote) {
      const {rows: admins} = await db.query(
        `select count(*)::int as n from public.profiles where role = 'admin'`,
      );
      if (admins[0].n <= 1) {
        console.error(
          `\nRefusing to demote the last remaining administrator — you would lock ` +
            `yourself out of doctor verification.\n`,
        );
        process.exitCode = 1;
        return;
      }
    }

    await db.query('begin');
    try {
      const {rowCount} = await db.query(
        `update public.profiles set role = $2 where id = $1`,
        [user.id, targetRole],
      );
      if (rowCount !== 1) throw new Error(`expected to update 1 row, updated ${rowCount}`);

      // The role-change audit entry is written by the profiles_audit trigger;
      // this records who ran the script and how.
      await db.query(
        `insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
         values ($1, $2, 'profiles', $1, $3)`,
        [
          user.id,
          targetRole === 'admin' ? 'ADMIN_GRANTED' : 'ADMIN_REVOKED',
          JSON.stringify({via: 'scripts/admin/promote-admin.mjs', from: user.role, to: targetRole}),
        ],
      );

      await db.query('commit');
    } catch (error) {
      await db.query('rollback').catch(() => {});
      throw error;
    }

    console.log(`\n  ${user.email} is now ${targetRole}.`);
    console.log('  The change takes effect on their next request.\n');
  } finally {
    await db.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(`\nfailed: ${scrub(String(error?.message ?? error))}\n`);
  process.exitCode = 1;
});
