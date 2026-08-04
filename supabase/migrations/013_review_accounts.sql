-- ============================================================================
-- EduSphere v2 -- migration 013
--
-- !!! ACTION REQUIRED BEFORE THIS MIGRATION IS USEFUL !!!
-- Section 2 below seeds FOUR PLACEHOLDER EMAIL ADDRESSES on the obviously-fake
-- "edusphere.local" domain (it cannot resolve or receive mail on the public
-- internet -- that is deliberate, so a forgotten swap fails loudly instead of
-- silently misdelivering a sign-in code to nobody). Every review account in
-- this system is passwordless: a one-time emailed code is the ENTIRE sign-in
-- mechanism (see docs/DEPLOYMENT-REVIEW.md). Before creating the matching
-- Supabase Auth users, REPLACE these four addresses with real inboxes the
-- reviewers can actually read, either by editing the INSERT in section 2
-- below before running this migration, or by updating the rows in
-- public.review_account_roles afterwards (role assignment re-applies to
-- whatever address is on file the next time a matching user signs up, or via
-- the backfill logic in section 4 if you re-run this file). No address here
-- is a real person -- do not mistake them for one.
--
-- Adds:
--   1. review_account_roles -- an email -> role mapping table for a handful
--      of reviewer accounts on a temporary review deployment.
--   2. Seed data -- four placeholder mappings, one per role
--      (student / doctor / committee_admin / admin). SEE THE WARNING ABOVE.
--   3. An extension of handle_new_user() (001) so a matching signup is
--      assigned its mapped role at profile-creation time, and the admin
--      mapping additionally lands in admin_emails so is_admin() recognizes
--      it. This is the SAME trigger (on_auth_user_created) calling the SAME
--      function name -- only the function body changes (CREATE OR REPLACE),
--      so there is exactly one AFTER INSERT trigger on auth.users, not two
--      competing ones.
--   4. A backfill DO block so a matching auth.users row that already existed
--      before this migration ran also gets its role (and, for admin, its
--      admin_emails row) applied -- order of operations (create the migration
--      vs. create the auth user) does not matter.
--   5. RLS + GRANTS on the new table, including grant_owner_full_access()
--      from 009, following that migration's conventions.
--
-- Explicitly OUT of scope here, by design (see docs/DEPLOYMENT-REVIEW.md):
--   - No seed content. This migration seeds only the role-mapping table
--     itself -- no exams, events, submissions, enrolments, doctor_courses,
--     or anything else. The database stays exactly as 001-012 left it.
--   - No passwords, anywhere, for any account. profiles/auth.users already
--     have no password-related columns this migration could touch, and none
--     are added. Every review account signs in with an emailed one-time
--     code -- see docs/DEPLOYMENT-REVIEW.md for the exact mechanism per role.
--   - owner_emails is never touched. The single owner identity seeded by 009
--     stays exactly as it is; none of the four review accounts is an owner.
--
-- Runs after 001-012: profiles, admin_emails, auth.users, handle_new_user(),
-- is_admin(), grant_owner_full_access(), prevent_role_update() (004) and the
-- profiles_role_check constraint covering ('student','doctor',
-- 'committee_admin','admin') (008) already exist. Nothing here redefines
-- profiles_role_check -- the four roles seeded below already fit it exactly.
--
-- Conventions follow 009/011/012: SECURITY DEFINER + STABLE + `SET
-- search_path` on helper functions, DROP ... IF EXISTS before every
-- CREATE TRIGGER / CREATE POLICY (CREATE TABLE is the only DDL form here
-- that has a real IF NOT EXISTS clause in Postgres), explicit table-level
-- GRANT for every RLS-enabled table (009's postmortem: enabling RLS without
-- a table-level GRANT makes every policy unreachable), no WITH CHECK (TRUE)
-- anywhere, and grant_owner_full_access() applied to the new table.
--
-- UNVERIFIED: this file has not been run against a database. No local
-- Supabase, no staging, no psql. Every FK target, constraint name, function
-- signature and policy below was hand-checked against 001-012 by reading the
-- files directly, and a bracket/dollar-quote balance check was run over this
-- file as a plain-text sanity check. That is not the same as executing it.
-- See docs/DEPLOYMENT-REVIEW.md, step 2, for why a `supabase db reset`
-- dry run against a local/branch database is strongly recommended before
-- this goes anywhere near the client's production project.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. REVIEW ACCOUNT ROLE MAPPING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.review_account_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  role       TEXT NOT NULL CHECK (role IN ('student', 'doctor', 'committee_admin', 'admin')),
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.review_account_roles IS
  'Email -> role mapping for temporary review-launch accounts. A matching auth.users signup (before or after this row exists) is assigned this role automatically -- see the extended handle_new_user() in section 3 and the backfill in section 4. Not a general-purpose invite system; scoped to this review launch.';

DROP TRIGGER IF EXISTS set_review_account_roles_updated_at ON public.review_account_roles;
CREATE TRIGGER set_review_account_roles_updated_at
  BEFORE UPDATE ON public.review_account_roles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. SEED DATA -- FOUR PLACEHOLDER MAPPINGS
--    !!! REPLACE THESE FOUR ADDRESSES BEFORE CREATING THE MATCHING AUTH
--    USERS -- see the banner at the top of this file. !!!
--    "edusphere.local" mirrors the placeholder convention 002_seed_data.sql
--    already uses for admin@edusphere.local -- an obviously-fake domain that
--    cannot deliver mail, not a real person and not a domain anyone owns.
--    ON CONFLICT DO UPDATE so editing an address here and re-running this
--    file (before it has been recorded as applied) updates the mapping
--    instead of erroring.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.review_account_roles (email, role, note) VALUES
  ('review-student@edusphere.local',
   'student',
   'Review launch placeholder (student). REPLACE with a real reachable inbox before use: an emailed one-time code is the only sign-in mechanism. Also gated on university OTP verification; see docs/DEPLOYMENT-REVIEW.md.'),
  ('review-doctor@edusphere.local',
   'doctor',
   'Review launch placeholder (doctor). REPLACE with a real reachable inbox before use: an emailed one-time code is the only sign-in mechanism.'),
  ('review-committee@edusphere.local',
   'committee_admin',
   'Review launch placeholder (student council / committee_admin). REPLACE with a real reachable inbox before use: an emailed one-time code is the only sign-in mechanism.'),
  ('review-admin@edusphere.local',
   'admin',
   'Review launch placeholder (admin). REPLACE with a real reachable inbox before use: an emailed one-time code is the only sign-in mechanism. This mapping also inserts the address into admin_emails (sections 3 and 4) so is_admin() recognizes it; it is never added to owner_emails.')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  note = EXCLUDED.note;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SIGNUP-TIME ASSIGNMENT -- extend handle_new_user() (001), don't
--    duplicate its trigger.
-- ═══════════════════════════════════════════════════════════════════════════
-- 001 already attaches ONE trigger to auth.users:
--   on_auth_user_created AFTER INSERT ... EXECUTE FUNCTION handle_new_user()
-- This section CREATE OR REPLACEs that same function (same name, same
-- signature, still RETURNS TRIGGER) so the existing trigger picks up the new
-- body automatically -- no second trigger is created. For every signup NOT
-- present in review_account_roles, v_role is NULL and
-- COALESCE(v_role, 'student') reproduces 001's original behaviour
-- byte-for-byte (the profiles.role column default is also 'student'). This
-- is the same additive, CREATE-OR-REPLACE-only extension style 012 used for
-- audit_portal_change()/audit_owner_write().

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role
  FROM public.review_account_roles
  WHERE email = lower(NEW.email);

  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    COALESCE(v_role, 'student')
  );

  -- The admin review account must also land in admin_emails, or is_admin()
  -- (which keys off admin_emails, not profiles.role) never returns TRUE for
  -- it. ON CONFLICT DO NOTHING: admin_emails.email is UNIQUE (001), and this
  -- can run again for the same address via the backfill in section 4.
  IF v_role = 'admin' THEN
    INSERT INTO public.admin_emails (email)
    VALUES (lower(NEW.email))
    ON CONFLICT (email) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- No REVOKE/GRANT reissue needed: handle_new_user() RETURNS TRIGGER, so it
-- was never callable as a PostgREST RPC and 001 never granted EXECUTE on it
-- to anything. CREATE OR REPLACE preserves whatever grants already exist
-- (none) -- only the body above changed.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. BACKFILL -- apply roles to any auth.users row that already existed
--    before this migration ran, so order does not matter.
-- ═══════════════════════════════════════════════════════════════════════════
-- profiles has a BEFORE UPDATE trigger, prevent_role_self_update (004), that
-- RAISE EXCEPTIONs on any role change where is_admin() is not true for the
-- caller. In a migration's execution context there is no PostgREST request,
-- so auth.jwt() is NULL and is_admin() always evaluates false here -- that
-- trigger would reject every UPDATE below if left enabled. It is disabled
-- only for the duration of this block (guarded by an existence check, so
-- this is a no-op rather than an error if 004 were ever absent) and
-- unconditionally re-enabled in the EXCEPTION handler, so a failure partway
-- through can never leave role self-escalation protection permanently off.

DO $$
DECLARE
  mapping         RECORD;
  target_user     RECORD;
  v_guard_present BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_role_self_update'
      AND tgrelid = 'public.profiles'::regclass
  ) INTO v_guard_present;

  IF v_guard_present THEN
    ALTER TABLE public.profiles DISABLE TRIGGER prevent_role_self_update;
  END IF;

  FOR mapping IN SELECT email, role FROM public.review_account_roles LOOP
    FOR target_user IN
      SELECT id FROM auth.users WHERE lower(email) = mapping.email
    LOOP
      UPDATE public.profiles
      SET role = mapping.role
      WHERE id = target_user.id
        AND role IS DISTINCT FROM mapping.role;

      IF mapping.role = 'admin' THEN
        INSERT INTO public.admin_emails (email)
        VALUES (mapping.email)
        ON CONFLICT (email) DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  IF v_guard_present THEN
    ALTER TABLE public.profiles ENABLE TRIGGER prevent_role_self_update;
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_present THEN
    ALTER TABLE public.profiles ENABLE TRIGGER prevent_role_self_update;
  END IF;
  RAISE;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS + GRANTS
-- ═══════════════════════════════════════════════════════════════════════════
-- grant_owner_full_access() (009) enables RLS on the table itself and
-- attaches the owner's unconditional FOR ALL policy + audit trigger -- see
-- that function's definition for exactly what it does. It does NOT grant
-- table-level privileges (that is a separate step, deliberately -- see its
-- own comment in 009): without the GRANT below, the owner's policy exists
-- but is unreachable through PostgREST for every role including the owner,
-- exactly the bug 009's postmortem describes. No policy here permits
-- anon/authenticated access beyond the owner bypass -- this table has no
-- direct client-facing consumer; every read happens inside SECURITY DEFINER
-- functions (section 3) or migration-context DO blocks (section 4), both of
-- which run with privileges that bypass RLS entirely.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_account_roles TO authenticated;

DO $$
BEGIN
  PERFORM public.grant_owner_full_access('review_account_roles');
END $$;

-- ============================================================================
-- END OF MIGRATION 013
-- ============================================================================
