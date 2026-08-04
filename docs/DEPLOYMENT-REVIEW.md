# EduSphere v2 — Temporary Review Launch Runbook

Target: the existing Supabase Cloud project `ahqcjymeeifftcrglani`. This is a
**temporary review deployment**, not the permanent production launch — it
reuses the client's real Supabase Cloud project and adds four passwordless
review accounts (one per role: student, doctor, student council, admin) so
reviewers can sign in and look around.

This document is a precise, ordered checklist. Follow it top to bottom. Steps
1 and 4 are marked CRITICAL — skipping or reordering either one will cost far
more time than reading them carefully now.

## Read this first

- **Nothing here is reversible without a backup.** Step 1 backs up the
  database before anything else touches it. Do not skip it, do not reorder
  it after step 2.
- **All four review accounts are passwordless — an emailed one-time code is
  the entire sign-in mechanism, for every role, no exceptions.** No account
  created for this launch has a password set, by design (see step 3). That
  means step 4 (SMTP) is not an optional nice-to-have: **if Supabase Auth's
  outgoing email is not correctly pointed at Resend with a verified sending
  domain, nobody — student, doctor, council, or admin — can sign in at
  all**, and the entire review launch will look completely broken for a
  reason that has nothing to do with the application code. Do step 4 before
  telling anyone the review link is ready.
- **The student review account cannot complete sign-in in this launch, full
  stop — this is a known, accepted limitation, not a bug to chase.** See
  step 7 for exactly why and exactly what that means for a student
  walkthrough.
- Every step below that touches a credential (database password, Resend API
  key, SMTP password, anything typed into the Supabase or Vercel dashboard)
  is something **you** do directly in that dashboard. Nothing in this
  runbook, the migration, or any agent that produced them generates, stores,
  transmits, or has ever seen a credential.

---

## 1. Back up the database first — CRITICAL, do this before anything else

Migration `010_remove_bookstore.sql` (part of the batch you're about to
apply in step 2) **irreversibly deletes**:

- Every row in `books`, `cart_items`, `orders`, and `order_items` — the
  tables themselves are dropped (`DROP TABLE ... CASCADE`), not just
  emptied.
- Every `favorites` row where `item_type = 'book'`.
- The entire `book-covers` Storage bucket and every file in it.
- The old `get_dashboard_stats()` / `get_user_dashboard_stats()` RPC
  signatures (replaced with new ones that no longer report book/order
  counts).

If any order or book data in that project has value, this is the only
chance to keep it. There is no undo once 010 runs other than restoring from
the backup you take now.

Get the database connection string from the Supabase dashboard: **Project
Settings → Database → Connection string (URI)**. Copy it yourself — this is
a credential and nobody else should type or see it.

```bash
# Full schema + data backup, using the Supabase CLI (no linking required —
# --db-url works standalone):
supabase db dump --db-url "postgresql://postgres:[YOUR-DB-PASSWORD]@db.ahqcjymeeifftcrglani.supabase.co:5432/postgres" -f edusphere_backup_pre_migration_schema.sql
supabase db dump --db-url "postgresql://postgres:[YOUR-DB-PASSWORD]@db.ahqcjymeeifftcrglani.supabase.co:5432/postgres" --data-only -f edusphere_backup_pre_migration_data.sql

# Equivalent single-file alternative if you have plain Postgres client tools
# installed (pg_dump/psql) and prefer not to use the Supabase CLI for this:
pg_dump "postgresql://postgres:[YOUR-DB-PASSWORD]@db.ahqcjymeeifftcrglani.supabase.co:5432/postgres" -f edusphere_backup_pre_migration_full.sql
```

**To restore** (only if something goes wrong and you need to recover the
pre-migration state):

```bash
psql "postgresql://postgres:[YOUR-DB-PASSWORD]@db.ahqcjymeeifftcrglani.supabase.co:5432/postgres" -f edusphere_backup_pre_migration_full.sql
```

Store the backup file(s) somewhere durable outside this repo (they are not
meant to be committed). Confirm the dump file is non-trivially sized before
moving on — a near-empty dump usually means the connection string was wrong,
not that the database is actually empty.

---

## 2. Apply the pending migrations, in order

Migrations `001`–`008` are already applied to this project. `009` and
everything after it have **never been run anywhere** — not locally, not on
staging, not on this project. They were hand-verified against `001`–`008` by
reading the files directly (bracket/dollar-quote balance checked as plain
text), but that is not the same as executing them. Treat this step as the
first real execution.

**Check what's actually pending before you run anything:**

```bash
supabase link --project-ref ahqcjymeeifftcrglani
supabase migration list
```

This compares the CLI's local migration history against what the *remote*
project's `supabase_migrations.schema_migrations` table records as applied.
Two outcomes:

- **`001`–`008` show as applied remotely, everything from `009` up shows as
  pending.** This is the expected case if `001`–`008` were originally
  applied via `supabase db push`. Proceed with the CLI push below.
- **`001`–`008` don't show as applied remotely** (this happens if they were
  originally run by hand through the SQL Editor rather than the CLI). In
  this case `supabase db push` will try to re-run `001` too and fail
  immediately (`relation "profiles" already exists` — migration 001 uses
  plain `CREATE TABLE`, not `CREATE TABLE IF NOT EXISTS`). If you see this,
  either run `supabase migration repair` to mark `001`–`008` as already
  applied without re-running them, or skip the CLI entirely and apply each
  pending file by hand through the SQL Editor (see below).

**Strongly recommended pre-flight check** — dry-run the whole pending batch
against a disposable database before touching the client's real project,
since `009`–`014`+ have never been executed even once:

```bash
supabase start          # local Supabase via Docker, or use a Supabase Cloud "branch"
supabase db reset        # drops and rebuilds the LOCAL/branch DB from every migration in order
```

**Never run `supabase db reset` directly against the linked cloud
project** — unlike `db push`, it drops and rebuilds the database from
scratch. It is safe and useful only against a local instance or a Supabase
branch, both disposable.

**Once satisfied, apply to the real project** — either:

```bash
supabase db push
```

or, if you're going the manual route: open the Supabase dashboard's **SQL
Editor**, and paste and run the contents of each pending migration file
**one at a time, in ascending numeric order** (`009`, `010`, `011`, `012`,
`013`, and so on).

**Apply every pending migration file, not just up through `013`.**
`supabase/migrations/` may contain files numbered higher than 013 by the
time you run this — check the directory listing yourself
(`ls supabase/migrations/` or the dashboard's migration history) and apply
**009 through the highest-numbered file present, in order**. This document
was written alongside `013_review_accounts.sql`, but other work (for
example, a course-materials/books-menu migration) may land after it and
before this runbook is actually used.

After the batch finishes, spot-check: `SELECT * FROM public.owner_emails;`
should show exactly one row (`elietecovery@gmail.com` — seeded by `009`, not
touched by `013`), and `SELECT * FROM public.review_account_roles;` should
show the four placeholder rows from `013` (see step 3 — you will edit these
before creating the matching users).

---

## 3. Create the four review auth users — passwordless, no password, ever

`013_review_accounts.sql` seeds a `review_account_roles` table mapping four
**placeholder** email addresses to roles:

| Placeholder email (replace this) | Role |
|---|---|
| `review-student@edusphere.local` | `student` |
| `review-doctor@edusphere.local` | `doctor` |
| `review-committee@edusphere.local` | `committee_admin` (student council) |
| `review-admin@edusphere.local` | `admin` |

**Before creating any auth user, replace these four placeholder addresses
with real inboxes your reviewers can actually read.** They're on the
obviously-fake `.local` domain on purpose — it cannot resolve or receive
mail, so a forgotten swap fails loudly (bounces / never arrives) instead of
silently sending a sign-in code to nobody. Edit the rows directly:

```sql
UPDATE public.review_account_roles SET email = 'the-real-reviewer-address@example.org'
WHERE email = 'review-student@edusphere.local';
-- repeat for the doctor / committee / admin rows
```

Do this **before** creating the matching auth users in the next step — the
role assignment is keyed to whatever address is in this table at the moment
the matching `auth.users` row appears (or, for a user that already exists,
the next time you re-run the backfill logic — see the migration file's own
header comment).

**Then, for each of the four real addresses**, in the Supabase dashboard:
**Authentication → Users → Add user.**

- Email: the real address you just put in `review_account_roles`.
- **Auto Confirm User: ON.** (Or equivalent "email confirmed" toggle —
  wording varies by dashboard version.)
- **Leave sign-in passwordless.** Every review account signs in with an
  emailed one-time code, not a password — see step 7 for exactly how, per
  role. If the "Add user" form insists on a password value to submit the
  form, let the dashboard auto-generate one if it offers that option;
  otherwise type any long throwaway string yourself and immediately forget
  it — it will never be used by anyone, on any device, at any point, because
  the app's sign-in flow for these accounts never asks for it. Do not record
  it, do not send it to anyone, do not give it to us.
- Role assignment is automatic: as soon as the user row exists, the extended
  `handle_new_user()` trigger from `013` looks up the email in
  `review_account_roles` and sets `profiles.role` accordingly. The admin
  account is also automatically inserted into `admin_emails` so
  `is_admin()` recognizes it (this is *not* the same thing as `owner_emails`
  — the single owner identity seeded by `009` is untouched by any of this).

If you create a user **before** editing `review_account_roles` (order
doesn't strictly matter per the migration's design), re-running the
migration's backfill block — or just manually running the equivalent
`UPDATE public.profiles SET role = ...` after temporarily disabling the
`prevent_role_self_update` trigger, exactly as the migration does — will
catch it up. Simplest in practice: just do the `UPDATE` in this step first,
then create the users.

---

## 4. Configure SMTP so a sign-in code can actually arrive — CRITICAL, loudest step in this document

**Read this section even if you're skimming everything else.**

Supabase's built-in outgoing email service is heavily rate-limited (a
handful of emails per hour) and by default generally only delivers to email
addresses that are members of the Supabase organization. **Every single
review account signs in exclusively via an emailed one-time code — student,
doctor, committee, and admin alike.** There is no password fallback for any
of them. If Supabase Auth's outgoing mail is left on the default service:

> **Nobody can sign in. Not one of the four roles. The review launch will
> look completely broken to every reviewer, and the reason will have
> nothing to do with the application, the database, or the migration —
> it will be exactly this step, skipped.**

Fix this before sharing the review link with anyone.

**Dashboard path:** Project Settings → Authentication → SMTP Settings (exact
menu wording varies slightly by dashboard version — look for "Custom SMTP"
or "SMTP Provider Settings" under Authentication).

Enable custom SMTP and point it at Resend (the client already holds a Resend
API key, used elsewhere for the student OTP Edge Function — reuse the same
verified sending domain here for consistency):

| Field | Value |
|---|---|
| Enable Custom SMTP | ON |
| Sender email | An address on a domain **verified in Resend** — e.g. `access@your-verified-domain.tld`. Reuse the same domain already verified for `RESEND_FROM_EMAIL` in step 6. |
| Sender name | `EduSphere` (or similar — this is cosmetic) |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `resend` (this literal string, not your Resend account email) |
| Password | Your Resend API key |

**The sending domain must already be verified inside Resend's own dashboard
(Resend → Domains), or delivery fails silently** — Resend will typically
accept the send request but the email never arrives, with no obvious error
surfaced back through Supabase's UI. If codes aren't arriving during the
smoke test in step 7, this is the first thing to check: confirm the domain
behind the "Sender email" address shows as verified in Resend, not just
"added."

While you're in the Auth settings, also sanity-check the project's OTP
rate-limit / minimum-interval-between-emails setting isn't set so low that
back-to-back test sign-ins during your own smoke test get throttled — the
default is usually fine, just be aware a rapid double-request from the same
tester can trigger it and looks like a delivery failure but isn't one.

*One-line fallback:* if SMTP is misconfigured and a code genuinely won't
arrive, Authentication → Users → (select the user) → Send magic link is a
dashboard-level action that goes through the same SMTP path — useful for
isolating whether the problem is SMTP or something else, but it will fail
for the same reason until SMTP itself is fixed. It is not a substitute for
doing this step correctly.

---

## 5. Vercel environment variables

Set these in the Vercel dashboard: Project → Settings → Environment
Variables.

**Required** — the app boots straight into a literal "Configuration
Required" screen (confirmed directly in `src/main.tsx`) if either is
missing:

```
VITE_SUPABASE_URL=https://ahqcjymeeifftcrglani.supabase.co
VITE_SUPABASE_ANON_KEY=<the project's anon/publishable key — Project Settings → API>
```

**Must be left EMPTY for this launch — do not set these:**

```
VITE_SUPABASE_FALLBACK_URL=
VITE_SUPABASE_FALLBACK_ANON_KEY=
```

Setting both activates a two-tier failover client (`src/lib/supabase.ts`)
that assumes a *separate*, self-hosted primary database exists and this
Cloud project is only its read-only fallback (see `docs/ARCHITECTURE-HA.md`
for that architecture). That self-hosted primary does not exist yet. This is
a single-database launch — leaving both fallback variables unset makes the
app behave exactly as if that failover code didn't exist at all (confirmed
in `src/lib/supabase.ts`: with no fallback configured, `supabase` is the
plain client with zero wrapping, zero extra health-check network calls).

**Optional, not required for this launch to function:**

```
VITE_SENTRY_DSN=
VITE_SENTRY_ENVIRONMENT=
VITE_SENTRY_TRACES_SAMPLE_RATE=
VITE_SENTRY_REPLAY_SAMPLE_RATE=
VITE_APP_VERSION=
```

Sentry is fully inert with `VITE_SENTRY_DSN` unset — leave these blank
unless you specifically want error tracking on this temporary deployment.

---

## 6. Edge Function secrets and deployment

Four Edge Functions exist in `supabase/functions/`: `student-otp`,
`university-sync`, `exam-download`, `approve-exam-submission`. Secrets are
set **per project**, not per function — one `supabase secrets set` call
makes a value available to every deployed function via `Deno.env.get()`.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and `SUPABASE_ANON_KEY`) are
injected automatically by the platform; never set those yourself.

```bash
supabase secrets set \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL="EduSphere <access@your-verified-domain.tld>" \
  APP_ORIGIN=https://your-vercel-deployment.vercel.app

supabase functions deploy student-otp
supabase functions deploy university-sync
supabase functions deploy exam-download
supabase functions deploy approve-exam-submission
```

**Verified from the actual source of each function** (names matter — a
mismatch here silently no-ops the function instead of erroring loudly):

- **`student-otp`** reads `UNIVERSITY_VERIFICATION_URL`,
  `UNIVERSITY_VERIFICATION_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
  (all required — missing any one returns a 503 "not configured" before the
  function does anything else) plus `APP_ORIGIN` for CORS.
- **`university-sync`** needs `APP_ORIGIN`, and (via
  `supabase/functions/_shared/university.ts`) `UNIVERSITY_API_BASE_URL` +
  `UNIVERSITY_API_KEY` for its schedule/courses calls (there is a legacy
  fallback to the `student-otp` names for the verify sub-call only, not for
  schedule/courses).
- **`exam-download`** needs only `APP_ORIGIN` beyond the auto-injected
  Supabase values — it does not touch Resend or the university API at all.
- **`approve-exam-submission`** likewise needs only `APP_ORIGIN` beyond the
  auto-injected values. **Its own header comment states it has never been
  deployed or executed even once** — see step 7, this is the single most
  likely thing in this launch to fail on first real use.

**There is no real university API for this review launch, and there will
not be one before you run this step.** `mocks/university-api/server.mjs`
implements the contract (`docs/UNIVERSITY-API.md`) faithfully, but its own
header comment says it plainly: *"This file is never deployed and never
imported by the app"* — it only binds to `localhost:8787` for local
development and is unreachable from Supabase's cloud Edge Function
environment. Setting `UNIVERSITY_VERIFICATION_URL` /
`UNIVERSITY_API_BASE_URL` to anything changes nothing observable here, since
there is nothing real to point them at. You can leave them unset for this
launch — `student-otp` will 503 with "Student login is not configured yet"
instead of a different 503 further into the request; the end result for the
student review account is identical either way (see step 7).

---

## 7. Smoke test

Content screens will be **empty** for exams, entrance exams, events, and
course materials beyond the existing course catalogue (seeded by `002`) —
this is deliberate, not a bug: no exams, events, submissions, or enrolments
were seeded for this review launch, by explicit decision.

### Student — cannot complete sign-in in this launch (expected, not a bug)

The student sign-in flow is: submit email + university file number →
`student-otp` Edge Function verifies against the university API → **only on
success** does it generate a one-time code and email it via Resend directly
(this path does not go through the SMTP setting from step 4 at all — it
calls Resend's API directly from the Edge Function). Because there is no
real university API (step 6), verification never succeeds, a code is never
generated, and a code is never sent. **The student review account never
receives a code and therefore never establishes a session at all** — not a
degraded session, no session. Every feature gated behind
`is_verified_student()` is unreachable as a direct consequence, including:

- The previous-exams archive (browsing and downloading)
- Assignments (viewing and submitting)
- Course materials
- Exam quality reports
- Academic sync (schedule / enrolment refresh)

The one thing that *is* fairly testable: that the login form itself renders
correctly and fails with a clear, non-crashing error message rather than
hanging or throwing — that's a legitimate (if narrow) UI smoke test. Don't
schedule a reviewer walkthrough expecting anything past that first screen to
work; it structurally cannot, independent of any configuration step above.

### Doctor

1. Sign in with the emailed one-time code (staff passwordless path).
2. Expect a first-login prompt to self-select which courses you teach
   (`set_doctor_courses()`  — this is intentional forced onboarding per
   migration `012`, not a seeding gap). Select one or more courses from the
   existing catalogue.
3. Publish a course material and/or an assignment for a selected course.
4. Submit an exam for committee review (`submit_exam_for_review`) —
   **test this one early, not last.** The Edge Function it depends on for
   the committee's approval half, `approve-exam-submission`, has never been
   executed even once (its own source comment says so explicitly). If the
   doctor→committee review pipeline is going to break, better to find out
   at the start of the smoke test than at the end.
5. Note: a doctor also passes `is_verified_student()`, so the (empty)
   previous-exams archive is technically browsable too — not the doctor's
   typical surface, but not blocked either.

### Committee (`committee_admin` / student council)

1. Sign in with the emailed one-time code.
2. Full CRUD on previous exams, entrance exams, and events — screens start
   empty; you can create something live to exercise the CRUD paths, since
   nothing stops you (this is *testing* the feature, not silently seeding
   the review database against the "no seed content" decision).
3. Review queue for doctor-submitted exams — see the doctor's step 4 above;
   approve or reject the same test submission from here, and confirm the
   approved file is actually fetchable afterward via `exam-download`.
4. Exam quality/problem reports triage — empty unless you generate one via
   another account first.

### Admin

1. Sign in with the emailed one-time code.
2. Full access to everything above, plus `admin_emails`, `audit_logs`
   (read-only), and owner-style impersonation controls
   (`start_impersonation` / `end_impersonation`) if you want to demonstrate
   acting as one of the other three review accounts.
3. Confirm `is_admin()` actually resolves true for this account specifically
   *because* of its `admin_emails` row from migration `013` — it is a
   separate identity from the project's one real owner
   (`elietecovery@gmail.com`, seeded by `009`), which already has admin-or-
   higher access unconditionally and is not part of this review-account
   system at all.

---

## 8. Tear-down — revoking the review accounts afterward

1. **Authentication → Users** in the dashboard: delete each of the four
   review-account users. `profiles.id` references `auth.users.id` with
   `ON DELETE CASCADE`, so each user's profile row, and everything that in
   turn cascades from it (doctor's `doctor_courses`/`assignments`/
   `course_materials` rows, committee/admin actions attributed to them,
   etc.), is cleaned up automatically. This does **not** touch anything
   created by other real users.
2. Remove the admin review email from `admin_emails` via the SQL Editor —
   there's no dashboard UI for this table:
   ```sql
   DELETE FROM public.admin_emails WHERE email = 'the-real-admin-review-address@example.org';
   ```
3. `review_account_roles` itself is inert once the matching auth users are
   gone (it only acts at signup-time or during the migration's backfill) —
   safe to leave as-is, or `TRUNCATE public.review_account_roles;` if you'd
   rather clear it out entirely. Either is fine.
4. Do **not** touch `owner_emails` — the single permanent owner identity is
   unrelated to this review-account system and must stay exactly as `009`
   left it.
5. Optional: if the Resend API key or any Edge Function secret was stood up
   solely for this review launch, rotate or revoke it once the review
   period ends.
