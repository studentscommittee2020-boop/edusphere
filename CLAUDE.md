# CLAUDE.md

Guidance for Claude Code sessions working in this repo. Read this before touching migrations, RLS, or role logic.

## Stack

Vite 5 + React 18 + TypeScript (strict) + Tailwind 3 + Supabase (Postgres/Auth/Storage/Edge Functions, Deno). Zustand for client state, React Router 6, `@sentry/react`, `sonner` toasts. Path alias `@/*` → `src/*`.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b --force && vite build` |
| `npm run typecheck` | `tsc -b --force` |
| `npm test` | `vitest run` (jsdom; coverage scoped to `services/academics.ts`, `lib/errors.ts`, `_shared/university.ts`) |
| `npm run mock:university` | Local stand-in for the university API on `:8787` (`mocks/university-api/server.mjs`) — never deployed, unreachable from Supabase Cloud |

**Never run `tsc --noEmit` directly and never "simplify" the typecheck/build scripts to it.** Root `tsconfig.json` is `{ "files": [], "references": [{"path": "./tsconfig.app.json"}] }` — a plain (non-`-b`) `tsc --noEmit` invocation ignores project references entirely and compiles the empty `files` array, exiting clean while checking **zero files**. This exact mistake previously hid a large amount of type drift for a long time. Only `tsc -b --force` (build mode, which follows references into `tsconfig.app.json`'s `include: ["src"]`) actually typechecks anything. If you ever touch these scripts or the tsconfig chain, verify with `npm run typecheck` and confirm it reports real file counts/errors, not an instant no-op exit.

## Architecture

Layering: **pages** (`src/pages/`) → **services** (`src/services/`, one file per domain: `academics`, `admin`, `council`, `courses`, `events`, `exams`, `favorites`, `materials`, `owner`, `portal`, `profile`, `reports`, `studentAuth`, `teaching`) → **Supabase client** (`src/lib/supabase.ts`) → Postgres/RLS. Reads mostly go straight to PostgREST under RLS; privileged writes go through SECURITY DEFINER RPCs or Edge Functions.

`src/lib/supabase.ts` is a two-tier failover client (self-hosted primary + Supabase Cloud read-only fallback via a `Proxy`), currently dormant — the self-hosted primary doesn't exist yet. With `VITE_SUPABASE_FALLBACK_URL`/`_ANON_KEY` unset (today's state, and the state for the review launch — see `docs/DEPLOYMENT-REVIEW.md` step 5) `supabase` is the plain `createClient()` object, zero wrapping. Full topology and risks: `docs/ARCHITECTURE-HA.md` (read §6 Risks first).

**Edge Functions** (`supabase/functions/`, Deno):
- `student-otp` — verifies (email, file number) against the university API, emails an OTP via Resend directly (bypasses Supabase SMTP).
- `university-sync` — pulls schedule/enrolments from the university API; the file number lives in memory only for this one call.
- `exam-download` — calls `request_exam_download()` RPC **as the caller** (quota check keyed to `auth.uid()`) first, then signs the URL as service role. Never sign first.
- `approve-exam-submission` — moves a file between Storage buckets (pending → live) then calls `approve_exam_submission()`; rolls back the copy if the RPC rejects. Never deployed/executed — treat as highest-risk on first real use.

`src/types/database.ts` is **hand-maintained**, not generated — there is no live database to run `supabase gen types` against for anything past migration 008. When you write or edit a migration, update this file in the **same change**, by hand, matching the migration's actual columns/constraints. Do not assume it already reflects any migration ≥ 009.

## Rules that are easy to get wrong

- **Interface language ≠ course track.** `profiles.language` (`fr`/`en`) is the UI chrome language, user-toggled, no academic meaning. `track` (`french`/`english`) — on `profiles`, `courses`, `previous_exams` — is what a course is taught/examined in, set by the university, never user-editable. A French-track student can browse in English UI; the course keeps its French name. Never derive a course name as `language === "fr" ? title_fr : title` — use `courseTitle(course)` from `src/services/academics.ts`, which switches on `track`. Full rules + anti-patterns: `docs/LANGUAGE-AND-TRACK.md`.
- **Student university file numbers are never persisted, logged, or sent to Sentry.** `university-sync`/`student-otp` hold the file number in memory for one call only and discard it — this is why sync requires re-entry every time rather than running on a schedule. `src/lib/sentry.ts` additionally regex-redacts any `file_number`/`fileNumber` key as defense in depth. Do not add a table column, cache, or store field that would persist one.
- `previous_exams.exam_type` is `'partiel' | 'midterm' | 'resit'` since migration 006 — **not** the original `'midterms' | 'final'`. Old code/docs referencing the old values are stale.
- `major` is free-text but the canonical Accounting/Audit major string is `'Audit & Accounting'`, not `'Audit'`. `semester` values are `LS1`–`LS9`.
- **Every RLS-enabled table needs an explicit table-level `GRANT`** to `anon`/`authenticated`, or its policies are unreachable — Postgres checks base table privilege *before* RLS runs, so a table with RLS on and no GRANT returns "permission denied" for everyone, owner included. This caused three blockers in migration 009 (see its §5b comment block). RLS narrows what a grant allows; it cannot widen a missing grant.
- **Never `WITH CHECK (TRUE)` on an INSERT policy** (explicit convention stated in migrations 012/013 headers). Pin inserts to the actual actor/owner column.
- SECURITY DEFINER functions: `REVOKE ALL ... FROM PUBLIC, anon` immediately after creation, then `GRANT EXECUTE` deliberately to the roles that should call it. Don't leave a SECURITY DEFINER function at its default (PUBLIC-callable) privilege.
- **Inside SECURITY DEFINER RPCs: `effective_user_id()` for actor attribution, real identity for permission checks.** `effective_user_id()` (added in migration 012) resolves to the impersonation target if the caller is an owner mid-impersonation, else `auth.uid()` — use it only to decide *who did this* (e.g. `reporter_id`, submission ownership). Permission predicates (`is_admin()`, `is_doctor()`, `is_owner()`, `is_committee_admin()`) always resolve against the caller's **real** JWT, never the impersonated target — swapping this reverses the design and lets an impersonated session inherit the owner's privileges, which is a privilege-escalation bug. See the design note at the top of migration 012 for why RLS policies themselves still key off `auth.uid()`, not `effective_user_id()`.
- Palette is fixed: dark surface ramp (`--surface-0`…`--surface-4`) + red primary (`--red-50`…`--red-900`, brand = `--red-600`) + green secondary (`--green-500`/`600`). Third accent is `--accent-red-300`/`400` — a lighter **red** step, not a new hue. No orange, amber, yellow, or violet anywhere in the UI; the client was explicit about this. Reference tokens (`src/index.css`), never raw `hsl()`.
- `src/lib/devAuth.ts` (`MOCK_ACCOUNTS`, `edusphere-dev-role` sessionStorage key) is a DEV-ONLY role switcher gated behind `import.meta.env.DEV`, which Vite replaces with the literal `false` in production so the minifier deletes the guarded code. It fakes only the client's idea of role for UI preview — it mints no JWT, and every Supabase call still runs unauthenticated/RLS-denied. After touching this file or `AuthContext.tsx`, verify: `npm run build` then confirm `dist/` contains neither `MOCK_ACCOUNTS` nor `edusphere-dev-role`.

## Roles

Resolved via `AuthContext` (`isOwner`, `isAdmin`, `isDoctor`, `isCommitteeAdmin`, `isVerifiedStudent`) and route-guarded in `src/App.tsx`.

| Role | Can do |
|---|---|
| `student` (verified) | Own schedule/enrolments (`/schedule`, `/my-courses`), assignments (`/assignments`), sessions, quota-limited exam downloads. Gated by `is_verified_student()`. |
| `doctor` | `/doctor`: self-select taught courses (`set_doctor_courses()`, forced first-login onboarding), publish course materials/assignments, submit print jobs, submit exams for committee review. |
| `committee_admin` ("Student Council") | `/print-desk`: full CRUD on previous exams / entrance exams / events, review queue to approve/reject doctor-submitted exams, exam quality/problem-report triage. |
| `admin` | Everything above, plus `/admin`, read-only `audit_logs`, `admin_emails` management, impersonation controls. Identity via `admin_emails` allowlist. |
| owner | Unconditional `FOR ALL USING (is_owner())` on every application table (`grant_owner_full_access()`, migration 009) — full read/write across every table and account, including impersonating any other role. Identity via `owner_emails`, checked against `lower(auth.jwt() ->> 'email')`; every other privilege predicate is `is_owner() OR ...`, so owner transitively passes `is_admin()`/`is_doctor()`/`is_committee_admin()`. Single seeded row: `elietecovery@gmail.com`. `/owner` route (`OwnerConsole.tsx`). |

## Migration status

**001–008 are applied to the live Supabase Cloud project (`ahqcjymeeifftcrglani`). 009 onward have never been run anywhere — no local Supabase, no staging, no production — hand-verified only** (bracket/dollar-quote balance checked as plain text, cross-referenced against 001–008 by reading files directly). Treat any session that runs them as the first real execution; expect to debug on first apply.

**Migration `010_remove_bookstore.sql` is destructive and irreversible**: `DROP TABLE ... CASCADE` on `books`/`cart_items`/`orders`/`order_items`, deletes `favorites` rows where `item_type = 'book'`, deletes the entire `book-covers` Storage bucket. Back up before running the 009+ batch — do not skip the backup step even in a throwaway environment, since the ordered-apply runbook assumes it.

Ordered apply runbook, backup commands, `supabase migration list` / `db push` vs. manual SQL Editor guidance, and the SMTP/review-account setup that must happen alongside it: **`docs/DEPLOYMENT-REVIEW.md`** — follow it top to bottom, do not reorder steps 1 and 2.

## Docs index

- `docs/UNIVERSITY-API.md` — the university's 3-endpoint contract (`/verify`, schedule, enrolments); nothing from it is persisted verbatim; `mocks/university-api/server.mjs` implements it for local dev only.
- `docs/LANGUAGE-AND-TRACK.md` — the interface-language-vs-track rule in full, with the exact anti-patterns to avoid.
- `docs/ARCHITECTURE-HA.md` — two-tier self-hosted-primary/Supabase-Cloud-fallback design; primary infrastructure not stood up yet; read §6 Risks first.
- `docs/DEPLOYMENT-REVIEW.md` — ordered runbook for backing up, applying migrations 009+, seeding review accounts, and SMTP setup for the temporary review launch.
- `docs/EduSphere-Platform-Overview.pdf` — faculty-facing platform overview (non-technical).
