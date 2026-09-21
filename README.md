<div align="center">

# Medix

**AI-Assisted Healthcare & Telemedicine Platform**

Patient and doctor accounts, credential verification, appointment scheduling,
and a security model enforced in the database rather than the browser.

<br/>

![Phase](https://img.shields.io/badge/phase-2%20of%206-0f233a?style=flat-square)
![Stack](https://img.shields.io/badge/React%2019-Vite%206-0f233a?style=flat-square)
![Backend](https://img.shields.io/badge/Supabase-PostgreSQL-3ecf8e?style=flat-square)
![RLS](https://img.shields.io/badge/RLS-enabled%20on%20all%20tables-3ecf8e?style=flat-square)
![Types](https://img.shields.io/badge/TypeScript-strict%20types-3178c6?style=flat-square)

</div>

---

> [!WARNING]
> **Academic project.** Do not enter real patient data, real medical records, or a
> password you use anywhere else. Nothing here is certified for clinical use.

---

## Contents

- [What this is](#what-this-is)
- [Current status](#current-status)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Database schema](#database-schema)
- [Security model](#security-model)
- [Testing](#testing)
- [Roadmap](#roadmap)

---

## What this is

A fourth-year engineering project building a telemedicine platform. The guiding
principle is that **authorization belongs in the database**, not in the
frontend. Hiding a route is a usability choice; PostgreSQL Row Level Security and
`BEFORE` triggers are what actually stop a request.

Concretely, a patient who edits the JavaScript in their own browser and forces
their way onto `/admin` sees an admin-shaped page containing no admin data,
because every query is re-authorised server-side against the verified JWT.

## Current status

**Phase 2 — Supabase foundation & authentication.** Complete and verified.

| Check | Command | Result |
| --- | --- | --- |
| Migrations applied | `npm run db:migrate` | 12 / 12 |
| Structural verification | `npm run db:verify` | 136 passed, 0 failed |
| Behavioural security suite | `npm run test:security` | 131 passed, 0 failed, 1 skipped |
| Typecheck | `npm run lint` | clean |
| Bundle secret scan | `npm run check:bundle` | no secrets found |

The single skipped test is documented in [Testing](#testing) — it is an
environment limitation, not an unverified control.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19, Vite 6, TypeScript |
| Styling | Tailwind CSS v4, `motion`, `lucide-react` |
| Routing | React Router 7 |
| Backend | Supabase — PostgreSQL, Auth, Storage |
| Authorization | Row Level Security + `SECURITY DEFINER` guard triggers |
| Tooling | Node scripts for migrations, verification and security tests |

No backend service of our own, and no ORM. The database is the API.

## Quick start

**Prerequisites:** Node.js 20+ and a Supabase project.

```bash
# 1. Install
npm install

# 2. Configure — copy the template and fill in your Supabase credentials
cp .env.example .env        # macOS / Linux
copy .env.example .env      # Windows

# 3. Create the schema, policies and storage buckets
npm run db:migrate

# 4. Confirm the security structures really exist
npm run db:verify

# 5. Run it
npm run dev                 # http://localhost:3000
```

### Creating the first administrator

There is deliberately **no way to register an admin account**. Sign up normally
through the app, then promote yourself from the command line, which requires
`DATABASE_URL` — a credential that only exists on your machine:

```bash
npm run admin:promote -- --email you@example.com --confirm
```

Admins approve doctor credentials and mark doctors verified. Until a doctor is
verified they are not listed publicly and cannot be booked.

> [!NOTE]
> If `npm run db:migrate` cannot connect, your network may not reach Supabase's
> IPv6-only direct endpoint. Run `node scripts/db/discover-connection.mjs` — it
> probes the Supavisor pooler hosts and prints a working `DATABASE_URL`.

## Environment variables

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | **browser** | Project API URL |
| `SUPABASE_PUBLISHABLE_KEY` | **browser** | Public client key; every table is still behind RLS |
| `SUPABASE_SECRET_KEY` | server only | Bypasses RLS. Used by scripts and tests only |
| `SUPABASE_JWKS_URL` | server only | JWT signature verification endpoint |
| `DATABASE_URL` | server only | Direct Postgres connection for migrations |
| `SUPABASE_CA_CERT` | server only | *Optional.* Path to Supabase's CA bundle for full TLS verification |

**How the boundary is enforced.** Variables in `.env` deliberately carry **no
`VITE_` prefix**, so Vite cannot auto-inline them. `vite.config.ts` forwards only
`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to client code, and **refuses to
build** if a server-side secret is found under a `VITE_` prefix or if a public
variable holds a secret-shaped value. `npm run check:bundle` then greps the built
output as an independent second check.

`.env` is git-ignored. `.env.example` contains placeholders only.

> [!CAUTION]
> `SUPABASE_SECRET_KEY` and the password inside `DATABASE_URL` are equivalent to
> root access. Never prefix them with `VITE_`, never commit them, never log them.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | `tsc --noEmit` typecheck |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | Show applied / pending / drifted migrations |
| `npm run db:verify` | 136 structural security assertions against the live schema |
| `npm run test:smoke` | Connectivity and signup-trigger check |
| `npm run test:security` | Full behavioural security suite |
| `npm run check:bundle` | Scan `dist/` for leaked secrets |
| `npm run admin:promote` | Grant or revoke administrator role |

### Applying and re-applying migrations

`supabase/migrations/*.sql` is the **source of truth** for the schema. The runner
keeps a ledger table and a SHA-256 per file:

- each file runs inside its own transaction, so a failure leaves nothing partial;
- already-applied files are skipped, so re-running is safe;
- editing a file that was already applied **stops the run** rather than letting
  the live schema drift from the recorded history. Add a new migration instead.

To force a re-apply of an edited, idempotent file:

```bash
npm run db:migrate -- --force-checksum
```

## Project structure

```
src/
├── App.tsx                  router shell
├── auth/
│   ├── AuthProvider.tsx     session restore, sign in/up/out, profile loading
│   └── ProtectedRoute.tsx   route gating (navigation only — not security)
├── components/              landing-page UI (unchanged from the original design)
├── lib/
│   ├── supabase.ts          browser client, publishable key only
│   ├── database.types.ts    hand-maintained schema types
│   └── errors.ts            maps DB/auth errors to safe user-facing messages
├── pages/
│   ├── LandingPage.tsx      the public site
│   ├── LoginPage.tsx  SignupPage.tsx
│   └── PatientPage.tsx  DoctorPage.tsx  AdminPage.tsx
└── data/mockData.ts         landing-page sample content

supabase/migrations/         12 SQL migrations — the schema source of truth
scripts/
├── db/                      migrate, verify, connection discovery
├── admin/                   administrator promotion
└── security/                post-build bundle secret scan
tests/security/              behavioural security suite
```

### Routes

| Route | Access |
| --- | --- |
| `/` | public — the landing page |
| `/login`, `/signup` | public; redirect away if already signed in |
| `/dashboard` | any authenticated user; redirects by role |
| `/patient` | `role = patient` |
| `/doctor` | `role = doctor` |
| `/admin` | `role = admin` |

## Database schema

Eight tables. UUID primary keys, `timestamptz` everywhere, `updated_at`
maintained by trigger.

| Table | Purpose |
| --- | --- |
| `profiles` | Identity and shared demographics. `role` is server-assigned |
| `patient_profiles` | Clinical profile — height, weight, blood group, allergies, conditions, medications |
| `doctor_profiles` | Professional profile and `verification_status` |
| `doctor_credentials` | Verification evidence; stores a Storage path, never document bytes |
| `doctor_availability` | Publishable time windows |
| `appointments` | Bookings, with database-level double-booking prevention |
| `consents` | Patient-granted access scopes; revocation never deletes |
| `audit_logs` | Append-only trail |

```
auth.users ──CASCADE──▶ profiles ──CASCADE──▶ patient_profiles
                            │
                            ├───CASCADE──▶ doctor_profiles ──CASCADE──▶ doctor_availability
                            │                     └────RESTRICT──▶ doctor_credentials
                            ├───RESTRICT──▶ appointments ◀──RESTRICT── doctor_profiles
                            └───RESTRICT──▶ consents     ◀──RESTRICT── doctor_profiles

audit_logs.actor_id  →  no foreign key (intentional)
```

`ON DELETE` behaviour is deliberate. Clinical and consent history use `RESTRICT`,
so deleting a user who has appointments is **blocked** rather than quietly
cascading records away. `audit_logs.actor_id` carries no foreign key on purpose:
an `ON DELETE SET NULL` would issue an `UPDATE` against an append-only table and
make user deletion impossible.

Storage buckets, all **private** and MIME-restricted:
`medical-reports`, `doctor-credentials`, `prescriptions`, `profile-images`.
Objects live at `<owner_uuid>/<random_uuid>.<ext>` and every policy anchors on
that first path segment.

## Security model

**Privilege escalation is closed at registration.** Signup metadata is fully
client-controlled, so the requested role passes through an allowlist: only
`doctor` is honoured, everything else — including `admin` — becomes `patient`.
`admin` is unreachable from any client request by construction.

**RLS cannot compare `OLD` to `NEW`.** A `WITH CHECK` clause only sees the new
row, so RLS alone can never express *"you may edit your profile but not change
your own role"*. Those rules live in `BEFORE UPDATE` triggers, which also apply
to the RLS-bypassing secret key. RLS decides which rows are reachable; triggers
decide which columns may change.

**Grants and policies, not just policies.** Every table has its privileges
revoked and re-granted minimally. `anon` receives `SELECT` only, never DML. No
application role is granted `DELETE` on any table. A table with a mistakenly
broad policy still cannot be written to if the privilege was never granted.

**Double booking is a database constraint.** "Check in the frontend, then insert"
is unsafe, and so is server-side "select then insert" at `READ COMMITTED`.
`appointments` carries GiST `EXCLUDE` constraints over a trigger-maintained
`tstzrange`, so two concurrent bookings for the same doctor cannot both commit —
the loser fails with `23P01`. Verified under real concurrency.

**Server-assigned columns.** `appointments.fee` is copied from the doctor's
profile, and `time_range`, `status`, `meeting_id` are derived or reset by the
booking trigger. A forged payload sent over raw HTTP has these values
overwritten, so the TypeScript types are a convenience rather than the defence.

**Consent gates clinical access.** A doctor reads a patient's clinical data only
while a matching consent row is `granted`. Revocation closes the path on the very
next request, for both table reads and Storage signed URLs. Revoking writes a
timestamp; it never deletes the record.

**Audit logs are append-only.** `actor_id` is overwritten with `auth.uid()`, so an
entry cannot be attributed to somebody else. There are no `UPDATE`/`DELETE`
policies, those privileges are revoked, *and* a trigger raises on any attempt —
which blocks the secret key too. Secret-bearing metadata keys are stripped on
write.

**Errors do not leak.** Database errors are mapped to plain sentences; constraint
names, SQL fragments and stack traces never reach the user. Authentication
failures are deliberately vague, and signup never confirms whether an address is
already registered.

### Not claimed

This is not "fully secure." Known gaps, kept deliberately in scope for later
work: no rate limiting on audit inserts, no Content Security Policy, no
anonymisation/erasure workflow, and TLS chain verification to Postgres is off
unless `SUPABASE_CA_CERT` is set.

## Testing

Two complementary layers, because structure can look correct while behaviour
still leaks:

```bash
npm run db:verify        # does the constraint/policy/trigger exist?
npm run test:security    # does it actually stop the attack?
```

The behavioural suite signs in as real patients, doctors and admins using the
**publishable key** and attacks the API from the position of someone who fully
controls the client. It covers cross-patient IDOR, self-promotion, doctor
self-verification, self-approval of credentials, mass assignment over raw HTTP,
concurrent double booking, consent revocation, audit tampering, JWT signature
and claim tampering, cross-tenant storage access, and constraint violations. It
creates its own users and removes them afterwards.

**One skipped assertion.** Verifying that the browser's `signUp()` cannot
self-assign `admin` requires a real signup, which this project's email sender
rejects with `over_email_send_rate_limit`. The same control is covered by two
passing assertions through the admin API, which writes the identical
`raw_user_meta_data` column that the signup trigger reads. It is reported as
`SKIP` rather than counted as a pass.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Landing page and UI foundation | Done |
| 2 | Supabase foundation, auth, RLS, storage | **Done** |
| 3 | Credential upload, availability editor, booking UI | Next |
| 4 | Video consultations, medical records, prescriptions | Planned |
| 5 | Report and laboratory-value analysis, medical RAG | Planned |
| 6 | Symptom risk assessment, AI consultation summaries | Planned |

No AI, RAG, OCR or video functionality is implemented yet — that is intentional,
and `npm run db:verify` asserts those later-phase tables do not exist so the
scope boundary stays honest.
