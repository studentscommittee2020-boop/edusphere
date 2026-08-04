-- EduSphere v2 — migration 012
--
-- Adds:
--   1. Owner impersonation — the owner can act as any user for support and
--      debugging, time-boxed to 30 minutes, every write while impersonating
--      cross-referenced in the audit trail against the owner's real identity.
--   2. Doctor teaching assignments — doctor_courses is the source of truth
--      for which courses a doctor actually teaches, and now scopes what they
--      may publish to and whose roster they may see.
--   3. Doctor -> council exam review queue — doctors propose previous_exams
--      entries; committee_admin/admin approve (atomically materialising the
--      live row) or reject (with a reason the doctor can see) before
--      anything reaches students.
--   4. Student council (committee_admin) powers — full CRUD on
--      previous_exams, entrance_exams and events, plus triage on the review
--      queue above.
--
-- Runs after 001-011: profiles, courses, previous_exams, entrance_exams,
-- events, assignments, course_materials, audit_logs, is_admin(), is_owner(),
-- is_doctor(), is_committee_admin(), is_verified_student(), has_role(),
-- handle_updated_at(), audit_portal_change(), audit_owner_write() and
-- grant_owner_full_access() already exist. Nothing here redefines their
-- existing behaviour except audit_portal_change()/audit_owner_write(), which
-- are extended (CREATE OR REPLACE, additive only) in section 1.
--
-- Conventions follow 009/011: SECURITY DEFINER + STABLE + `SET search_path`
-- on predicate helpers, REVOKE-then-GRANT on any function that must not be
-- callable by anon, explicit table GRANTs sized to intended access (RLS is a
-- second gate, not the first — see 009's postmortem: enabling RLS without a
-- table-level GRANT makes every policy unreachable), no `WITH CHECK (TRUE)`
-- on any INSERT policy, and grant_owner_full_access() applied to every new
-- mutable table UNLESS the table is itself part of the accountability trail
-- — in which case it is excluded exactly as audit_logs is (the one case that
-- applies here is impersonation_sessions; see section 1).
--
-- UNVERIFIED: this file has not been run against a database. No local
-- Supabase, no staging, no psql. Every FK target, constraint name, function
-- signature and policy below was hand-checked against 001-011 by reading the
-- files directly, and a bracket/paren balance check was run over this file
-- as a plain-text sanity check. That is not the same as executing it. A
-- `supabase db reset` dry run is required before this goes anywhere near
-- production — see the report accompanying this migration for a fuller list
-- of what to smoke-test first.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. OWNER IMPERSONATION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.impersonation_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Required and length-bounded: impersonation here has deliberately no
  -- restriction on WHO can be impersonated (see start_impersonation() below),
  -- so a mandatory reason is the one accountability lever left. This is an
  -- addition on top of the spec's plain "reason TEXT" column, not a
  -- redesign of it.
  reason         TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ,
  CHECK (expires_at > started_at),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

COMMENT ON TABLE public.impersonation_sessions IS
  'Owner "act as" sessions. Auto-expire 30 minutes after start_impersonation(). Part of the accountability trail, not an ordinary data table — see the exclusion from grant_owner_full_access below, mirroring how 009/011 protect audit_logs.';

CREATE INDEX idx_impersonation_sessions_owner_started
  ON public.impersonation_sessions(owner_id, started_at DESC);
CREATE INDEX idx_impersonation_sessions_target_started
  ON public.impersonation_sessions(target_user_id, started_at DESC);
-- Every consumer below (current_impersonation, effective_user_id, both audit
-- triggers) runs this exact lookup on close to every request. Partial index
-- keeps it a tiny, constant-size scan regardless of how much session history
-- accumulates, since only ever a handful of rows are ever "open" at once.
CREATE INDEX idx_impersonation_sessions_active
  ON public.impersonation_sessions(owner_id)
  WHERE ended_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- current_impersonation() — required RPC: the calling owner's active,
-- non-expired session, or no row if none.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_impersonation()
RETURNS public.impersonation_sessions AS $$
  SELECT *
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- DESIGN NOTE: why RLS policies do NOT consult effective_user_id()
--
-- effective_user_id() exists as a primitive below, but this migration does
-- not rewire a single existing policy or SECURITY DEFINER function from
-- 001-011 to use it in place of auth.uid(). That is a deliberate scope
-- boundary, argued here rather than assumed:
--
-- 1. It is not needed for the read side. grant_owner_full_access() (009)
--    already gives the owner an unconditional FOR ALL USING (is_owner())
--    policy on every application table. The owner can already read (and
--    write) anything, impersonating or not — impersonation does not change
--    what data is reachable, only how a client chooses to scope/display it
--    (in practice: filter every query to
--    current_impersonation().target_user_id instead of the owner's own id,
--    which is a client concern, not an RLS one).
--
-- 2. Retrofitting it into existing policies has a much larger blast radius
--    than it looks, and the two things that would need to change do not
--    move together:
--      a. row-ownership checks like `user_id = auth.uid()` (dozens of these
--         across 001/007/008/009/011), versus
--      b. role checks — is_admin()/is_doctor()/is_committee_admin() — which
--         key off auth.jwt() ->> 'email' or profiles.role for auth.uid(),
--         completely independent of any target swap.
--    Swapping only (a) produces an inconsistent hybrid: an owner
--    impersonating a plain student would start satisfying student-scoped
--    predicates AND keep passing is_admin()/is_owner() (because those still
--    resolve against the owner's own real JWT) — i.e. strictly WIDER
--    combined access than either role alone. That is precisely the
--    "silently widening every policy" failure this note exists to avoid.
--    Doing this safely means auditing every helper in 001-011 for
--    impersonation-awareness, not adding one function.
--
-- 3. The alternative failure mode — impersonation staying read-oriented
--    rather than fully transparent for writes — is the smaller risk of the
--    two, and this migration accepts it at the margin: a SECURITY DEFINER
--    function that hardcodes auth.uid() as "the acting student"
--    (submit_assignment(), submit_exam_report()) will attribute an owner's
--    impersonated action to the owner, not the target, unless/until that
--    specific function is deliberately updated to call effective_user_id()
--    instead. That is a one-function-at-a-time, reviewed decision for
--    whoever owns that workflow next — not something this migration should
--    decide wholesale by editing auth.uid() out of eleven prior migrations
--    it cannot execute or test.
--
-- Net effect: impersonation today is fully functional for "see exactly what
-- this user's account contains" (the owner's own bypass, scoped client-side)
-- and for direct edits via the owner console (owner.ts already writes
-- against profiles/etc. under the owner's existing bypass — impersonation
-- adds no new reach there, only better audit context via impersonated_by,
-- below). It is NOT wired through to make in-app actions performed while
-- impersonating come out attributed to the target user inside domain RPCs.
-- If that is required later, extend it function-by-function, starting from
-- whichever RPC the product need actually points at.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.effective_user_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (
      SELECT target_user_id
      FROM public.impersonation_sessions
      WHERE owner_id = auth.uid()
        AND ended_at IS NULL
        AND expires_at > NOW()
      ORDER BY started_at DESC
      LIMIT 1
    ),
    auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id UUID,
  p_reason TEXT
)
RETURNS public.impersonation_sessions AS $$
DECLARE
  v_session public.impersonation_sessions;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only an owner may start an impersonation session';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot impersonate yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Unknown target user';
  END IF;

  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason of at least 3 characters is required';
  END IF;

  -- Deliberately no restriction on impersonating admins/other owners — the
  -- task this migration implements calls this out as an explicit product
  -- decision, not an oversight.

  -- One active session per owner at a time. Starting a new one implicitly
  -- closes any prior open session so current_impersonation()'s "THE active
  -- session" (singular) can never be ambiguous.
  UPDATE public.impersonation_sessions
  SET ended_at = NOW()
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW();

  INSERT INTO public.impersonation_sessions (
    owner_id, target_user_id, reason, started_at, expires_at
  ) VALUES (
    auth.uid(), p_target_user_id, btrim(p_reason), NOW(), NOW() + INTERVAL '30 minutes'
  )
  RETURNING * INTO v_session;

  -- impersonation_sessions has no INSERT/UPDATE policy for anyone (see RLS
  -- below), so this is the only place a session is ever created — logged
  -- explicitly here rather than via audit_portal_change()'s generic trigger,
  -- because that trigger's hardcoded metadata keys (status/title/
  -- assignment_id/attempt_number) don't exist on this table and would
  -- capture nothing useful.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'impersonation_started',
    'impersonation_sessions',
    v_session.id,
    jsonb_build_object(
      'target_user_id', p_target_user_id,
      'reason', v_session.reason,
      'expires_at', v_session.expires_at
    )
  );

  RETURN v_session;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.end_impersonation()
RETURNS VOID AS $$
DECLARE
  v_session public.impersonation_sessions;
BEGIN
  SELECT * INTO v_session
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_session.id IS NULL THEN
    RETURN; -- Nothing active: ending is idempotent, not an error.
  END IF;

  UPDATE public.impersonation_sessions
  SET ended_at = NOW()
  WHERE id = v_session.id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'impersonation_ended',
    'impersonation_sessions',
    v_session.id,
    jsonb_build_object('target_user_id', v_session.target_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- Extend the existing audit triggers (008/009) so every write they log while
-- an impersonation is active also records who was being impersonated,
-- alongside the real actor (actor_id, unchanged — see the design note
-- above). Both changes are additive: jsonb_strip_nulls(...) || extra_metadata
-- with extra_metadata defaulting to '{}'::JSONB is a byte-identical no-op
-- merge for every call site that already exists (print_documents,
-- assignments, assignment_submissions, course_materials, exam_reports, and
-- now exam_submissions/doctor_courses below) whenever no impersonation is
-- active, which is the overwhelming majority of writes.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_portal_change()
RETURNS TRIGGER AS $$
DECLARE
  row_data       JSONB;
  target_id      UUID;
  impersonation  public.impersonation_sessions;
  extra_metadata JSONB := '{}'::JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
    target_id := OLD.id;
  ELSE
    row_data := to_jsonb(NEW);
    target_id := NEW.id;
  END IF;

  SELECT * INTO impersonation
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF impersonation.id IS NOT NULL THEN
    extra_metadata := jsonb_build_object(
      'impersonated_by', jsonb_build_object(
        'owner_id', impersonation.owner_id,
        'target_user_id', impersonation.target_user_id,
        'session_id', impersonation.id
      )
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    target_id,
    jsonb_strip_nulls(jsonb_build_object(
      'status', row_data ->> 'status',
      'title', row_data ->> 'title',
      'assignment_id', row_data ->> 'assignment_id',
      'attempt_number', row_data ->> 'attempt_number'
    )) || extra_metadata
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.audit_owner_write()
RETURNS TRIGGER AS $$
DECLARE
  row_data       JSONB;
  target_id      UUID;
  impersonation  public.impersonation_sessions;
  extra_metadata JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.is_owner() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    row_data  := to_jsonb(OLD);
    target_id := OLD.id;
  ELSE
    row_data  := to_jsonb(NEW);
    target_id := NEW.id;
  END IF;

  -- Every row reaching this point is already an owner write (guarded
  -- above), so the only question is whether they were impersonating someone
  -- while they made it.
  SELECT * INTO impersonation
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF impersonation.id IS NOT NULL THEN
    extra_metadata := jsonb_build_object(
      'impersonated_by', jsonb_build_object(
        'owner_id', impersonation.owner_id,
        'target_user_id', impersonation.target_user_id,
        'session_id', impersonation.id
      )
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'owner_' || lower(TG_OP),
    TG_TABLE_NAME,
    target_id,
    jsonb_build_object(
      'owner_email', lower(auth.jwt() ->> 'email'),
      'before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'after',  CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    ) || extra_metadata
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- RLS + GRANTS — impersonation_sessions
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impersonation_sessions_select_owner"
  ON public.impersonation_sessions FOR SELECT
  USING (owner_id = auth.uid());

-- is_admin() already returns TRUE for is_owner(), so a plain admin (not
-- also the owner) would otherwise have no way to review impersonation
-- history at all. This is oversight data, not a mutation surface, so a read
-- grant is safe.
CREATE POLICY "impersonation_sessions_select_admin"
  ON public.impersonation_sessions FOR SELECT
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for anyone, including the owner — exactly
-- like audit_logs (see 011's precedent comment on excluding a table from
-- grant_owner_full_access). All writes go through start_impersonation()/
-- end_impersonation() above, which are SECURITY DEFINER and therefore do
-- not need a table grant to write. This also means impersonation_sessions
-- is deliberately EXCLUDED from the grant_owner_full_access() DO block at
-- the end of this migration (section 5) — giving the owner an unconditional
-- FOR ALL policy here would let them edit expires_at to extend their own
-- session indefinitely, or delete a session to hide that it happened, which
-- defeats the entire point of a time-boxed, audited "act as".

GRANT SELECT ON public.impersonation_sessions TO authenticated;

REVOKE ALL ON FUNCTION public.effective_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_impersonation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_impersonation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_impersonation() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.effective_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_impersonation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_impersonation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_impersonation() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. DOCTOR TEACHING ASSIGNMENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.doctor_courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  semester      TEXT NOT NULL
    CHECK (semester IN ('LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, course_id, academic_year, semester)
);

COMMENT ON TABLE public.doctor_courses IS
  'Which courses a doctor teaches, per academic year and semester. Scopes doctor write access to assignments/course_materials and doctor read access to student_enrollments — see the policy updates below.';

CREATE TRIGGER set_doctor_courses_updated_at
  BEFORE UPDATE ON public.doctor_courses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_doctor_courses_doctor ON public.doctor_courses(doctor_id);
CREATE INDEX idx_doctor_courses_course_year_semester
  ON public.doctor_courses(course_id, academic_year, semester);

-- General-purpose target-eligibility helper, introduced for impersonation
-- actor attribution (see the "IMPERSONATION ACTOR ATTRIBUTION" section near
-- the end of this file). Unlike has_role()/is_doctor()/is_committee_admin()
-- — which always check the CALLER via auth.uid() — this checks an
-- ARBITRARY user id's profiles.role, which is what's needed once an action
-- is attributed to an impersonation target rather than the real caller.
-- Placed here, ahead of set_doctor_courses() below, so every use in this
-- file is a backward reference; it is used again later by the student/
-- doctor self-service RPCs.
--
-- Deliberately NOT granted to authenticated/anon: it is only ever called
-- from inside other SECURITY DEFINER functions (which run with their
-- owner's privileges internally and so need no grant of their own on
-- functions they call — see grant_owner_full_access() in section 1 for the
-- same pattern), never referenced by an RLS or storage policy directly.
-- Exposing it as a bare client-callable RPC would let any authenticated
-- caller probe an arbitrary UUID's role — a minor information disclosure
-- with no legitimate use here.
CREATE OR REPLACE FUNCTION public.is_target_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = p_role
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.is_target_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Replaces the calling doctor's entire teaching load in one call, so both
-- the forced first-login self-select and any later edit are a single atomic
-- operation rather than a client-side diff of inserts/deletes across
-- multiple round trips.
--
-- ACTOR/PERMISSION split (see the design note on effective_user_id() in
-- section 1, and the fuller pattern this mirrors in the "IMPERSONATION
-- ACTOR ATTRIBUTION" section near the end of this file): is_doctor() below
-- is a PERMISSION check on the REAL caller (auth.uid()) and stays that way
-- — it already returns TRUE for the owner unconditionally via is_admin().
-- v_actor_id is the ACTING identity the teaching load is written for: the
-- impersonated target if a session is active, otherwise auth.uid() itself.
-- Without this, an owner impersonating a doctor to fix their course list
-- would silently edit the OWNER's own (nonexistent, irrelevant)
-- doctor_courses rows instead of the doctor's.
CREATE OR REPLACE FUNCTION public.set_doctor_courses(p_assignments JSONB)
RETURNS SETOF public.doctor_courses AS $$
DECLARE
  entry JSONB;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  IF NOT public.is_doctor() THEN
    RAISE EXCEPTION 'Only a doctor may set their own teaching assignments';
  END IF;

  -- ELIGIBILITY: the acting identity must actually be a doctor — catches an
  -- owner impersonating a student/committee_admin/admin here, which
  -- is_doctor() above cannot (it is always true for the owner).
  IF NOT public.is_target_role(v_actor_id, 'doctor') THEN
    RAISE EXCEPTION 'The acting user is not a doctor';
  END IF;

  IF jsonb_typeof(p_assignments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_assignments must be a JSON array';
  END IF;

  IF jsonb_array_length(p_assignments) > 100 THEN
    RAISE EXCEPTION 'Too many course assignments in a single call';
  END IF;

  -- Validate every entry before touching any data, so one bad row in the
  -- array cannot leave a partially-replaced teaching load after the DELETE
  -- below has already run.
  FOR entry IN SELECT * FROM jsonb_array_elements(p_assignments)
  LOOP
    IF NOT (entry ? 'course_id' AND entry ? 'academic_year' AND entry ? 'semester') THEN
      RAISE EXCEPTION 'Each assignment needs course_id, academic_year and semester';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.courses WHERE id = (entry ->> 'course_id')::UUID
    ) THEN
      RAISE EXCEPTION 'Unknown course_id %', entry ->> 'course_id';
    END IF;

    IF (entry ->> 'semester') NOT IN
      ('LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9') THEN
      RAISE EXCEPTION 'Invalid semester %', entry ->> 'semester';
    END IF;
  END LOOP;

  -- ACTOR: doctor_id = v_actor_id, not auth.uid() — see the function
  -- header comment above.
  DELETE FROM public.doctor_courses WHERE doctor_id = v_actor_id;

  -- A doctor submitting the same (course, year, semester) pair twice in one
  -- call would otherwise trip the UNIQUE constraint mid-statement and abort
  -- the whole replace with nothing written. ON CONFLICT DO NOTHING makes a
  -- duplicate within the same call a no-op instead of an aborted
  -- transaction (there is nothing pre-existing to conflict with immediately
  -- after the DELETE above — the only possible conflict is between two rows
  -- of this same INSERT, which Postgres still evaluates against ON CONFLICT
  -- row-by-row within one statement).
  RETURN QUERY
  INSERT INTO public.doctor_courses (doctor_id, course_id, academic_year, semester)
  SELECT
    v_actor_id,
    (entry ->> 'course_id')::UUID,
    entry ->> 'academic_year',
    entry ->> 'semester'
  FROM jsonb_array_elements(p_assignments) AS entry
  ON CONFLICT DO NOTHING
  RETURNING *;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.doctor_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_courses_select_own_or_staff"
  ON public.doctor_courses FOR SELECT
  USING (doctor_id = auth.uid() OR public.is_admin() OR public.is_committee_admin());

-- No direct INSERT/UPDATE/DELETE policy for a doctor's own rows:
-- set_doctor_courses() (SECURITY DEFINER) is the only self-service write
-- path, exactly like 008's submit_assignment()/assignment_submissions. Admin
-- gets explicit policies (not just the owner bypass) so a plain, non-owner
-- admin can correct a doctor's teaching load from the admin panel.
CREATE POLICY "doctor_courses_insert_admin"
  ON public.doctor_courses FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "doctor_courses_update_admin"
  ON public.doctor_courses FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "doctor_courses_delete_admin"
  ON public.doctor_courses FOR DELETE
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_courses TO authenticated;

REVOKE ALL ON FUNCTION public.set_doctor_courses(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_doctor_courses(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Tighten policies that predate doctor_courses and were scoped too loosely.
-- ─────────────────────────────────────────────────────────────────────────

-- Was "any doctor with any assignment in this course" (009) — now that
-- doctor_courses is the real source of truth for a teaching load, key off
-- it directly. Matched on course_id + academic_year + semester (not just
-- course_id) so a doctor who taught the course in a prior year does not
-- keep seeing this year's roster after the year rolls over.
DROP POLICY IF EXISTS "enrollments_select_self_or_staff" ON public.student_enrollments;
CREATE POLICY "enrollments_select_self_or_staff"
  ON public.student_enrollments FOR SELECT
  USING (
    student_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.doctor_courses
      WHERE doctor_courses.doctor_id = auth.uid()
        AND doctor_courses.course_id = student_enrollments.course_id
        AND doctor_courses.academic_year = student_enrollments.academic_year
        AND doctor_courses.semester = student_enrollments.semester
    )
  );

-- assignments.course_id is nullable (a general assignment not tied to one
-- course was already possible pre-012), so course_id IS NULL keeps working.
-- A course-scoped assignment now requires the doctor to actually teach that
-- course. assignments has no academic_year/semester column of its own to
-- match against (unlike student_enrollments above), so this can only check
-- "do they teach this course at all", not "this specific year" — a doctor
-- keeps write access to an existing course-scoped assignment across a year
-- rollover unless their doctor_courses row is also removed. Flagged as a
-- known gap, not fixed here: closing it fully needs a new column on
-- assignments, which is outside this migration's brief.
DROP POLICY IF EXISTS "assignments_insert_doctor" ON public.assignments;
CREATE POLICY "assignments_insert_doctor"
  ON public.assignments FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND public.is_doctor()
    AND (
      course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.doctor_courses
        WHERE doctor_courses.doctor_id = auth.uid()
          AND doctor_courses.course_id = assignments.course_id
      )
    )
  );

DROP POLICY IF EXISTS "assignments_update_doctor" ON public.assignments;
CREATE POLICY "assignments_update_doctor"
  ON public.assignments FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      doctor_id = auth.uid()
      AND (
        course_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.doctor_courses
          WHERE doctor_courses.doctor_id = auth.uid()
            AND doctor_courses.course_id = assignments.course_id
        )
      )
    )
  );

-- course_materials.course_id is NOT NULL, so unlike assignments there is no
-- "unscoped" escape hatch here — every material must belong to a course the
-- doctor teaches.
DROP POLICY IF EXISTS "materials_insert_doctor" ON public.course_materials;
CREATE POLICY "materials_insert_doctor"
  ON public.course_materials FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND public.is_doctor()
    AND EXISTS (
      SELECT 1 FROM public.doctor_courses
      WHERE doctor_courses.doctor_id = auth.uid()
        AND doctor_courses.course_id = course_materials.course_id
    )
  );

DROP POLICY IF EXISTS "materials_update_doctor" ON public.course_materials;
CREATE POLICY "materials_update_doctor"
  ON public.course_materials FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      doctor_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.doctor_courses
        WHERE doctor_courses.doctor_id = auth.uid()
          AND doctor_courses.course_id = course_materials.course_id
      )
    )
  );

-- Policies considered and deliberately NOT keyed off doctor_courses:
--   - print_documents_insert_doctor: print requests are not "published to a
--     course's students" (course_id is nullable and the workflow is
--     committee-facing printing, not teaching), so it is out of the scope
--     this table change is meant to address.
--   - submissions_select_owner_doctor_or_admin /
--     submissions_update_doctor_or_admin (assignment_submissions): already
--     keyed to "the doctor who owns THIS assignment", and now that
--     assignments_insert_doctor/assignments_update_doctor only let a doctor
--     own assignments for courses they teach, correctness here follows
--     transitively without touching these policies directly.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DOCTOR -> COUNCIL EXAM REVIEW QUEUE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.exam_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id        UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  -- Denormalised at submission time from courses, same pattern previous_exams
  -- already uses for course_title/course_title_fr.
  course_title     TEXT NOT NULL,
  course_title_fr  TEXT NOT NULL,
  major            TEXT NOT NULL
    CHECK (major IN ('Common', 'Audit & Accounting', 'Finance', 'Marketing', 'Management', 'MIS')),
  semester         TEXT NOT NULL
    CHECK (semester IN ('LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9')),
  track            TEXT NOT NULL DEFAULT 'french'
    CHECK (track IN ('french', 'english')),
  year             TEXT NOT NULL,
  -- Matches previous_exams' CURRENT constraint (migration 006 remapped the
  -- original 001 values 'midterms'/'final' to 'midterm'/'partiel' — this
  -- table is new, so it goes straight to the live value set).
  exam_type        TEXT NOT NULL
    CHECK (exam_type IN ('partiel', 'midterm', 'resit')),
  pages            INTEGER NOT NULL DEFAULT 1 CHECK (pages > 0),
  storage_path     TEXT NOT NULL UNIQUE,
  original_name    TEXT NOT NULL,
  mime_type        TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes       BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  status           TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(rejection_reason) <= 2000),
  -- Set by approve_exam_submission() when it creates the live row. ON DELETE
  -- SET NULL rather than CASCADE: deleting the live previous_exams row later
  -- (committee_admin now has that power — see section 4) should not erase
  -- the historical record of who submitted and who approved it, only detach
  -- the dangling reference.
  approved_exam_id UUID REFERENCES public.previous_exams(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewed_at IS NULL OR status IN ('approved', 'rejected')),
  CHECK (status <> 'rejected' OR char_length(btrim(rejection_reason)) > 0)
  -- Deliberately NOT also enforcing "status = 'approved' => approved_exam_id
  -- IS NOT NULL" as a table CHECK: approved_exam_id's own ON DELETE SET NULL
  -- above would then conflict with that CHECK the moment a committee_admin
  -- deletes the live exam (the FK action nulls the column in the same
  -- statement that a CHECK would be evaluated against, blocking the delete
  -- outright). The invariant still holds at creation time — it's enforced
  -- procedurally, by approve_exam_submission() always setting both columns
  -- together in the same UPDATE — it just cannot also be a standing
  -- constraint without fighting the FK's own cleanup behaviour later.
);

COMMENT ON TABLE public.exam_submissions IS
  'Doctor-proposed previous_exams entries awaiting committee/admin review. Approval atomically creates the live previous_exams row via approve_exam_submission(); nothing here is visible to students.';

CREATE TRIGGER set_exam_submissions_updated_at
  BEFORE UPDATE ON public.exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_exam_submissions_change
  AFTER INSERT OR UPDATE OR DELETE ON public.exam_submissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE INDEX idx_exam_submissions_uploader_created
  ON public.exam_submissions(uploader_id, created_at DESC);
CREATE INDEX idx_exam_submissions_status_created
  ON public.exam_submissions(status, created_at DESC);

-- Storage-policy predicate, same shape as 008's can_read_print_file()/
-- can_read_assignment_attachment().
CREATE OR REPLACE FUNCTION public.can_read_exam_submission(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exam_submissions submission
    WHERE submission.storage_path = p_storage_path
      AND (
        public.is_admin()
        OR public.is_committee_admin()
        OR submission.uploader_id = auth.uid()
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- The only write path for a doctor's own submission (no INSERT policy is
-- granted on exam_submissions directly — see RLS below). Requires the file
-- to already be sitting in the pending bucket under the caller's own folder,
-- same validate-then-insert shape as 008's submit_assignment().
--
-- ACTOR/PERMISSION split (see the design note on effective_user_id() in
-- section 1): is_doctor() is a PERMISSION check on the real caller and
-- stays that way. v_actor_id is the ACTING identity uploader_id is written
-- for — the impersonated target if a session is active, otherwise
-- auth.uid(). Same bug class, same fix, as submit_assignment()/
-- submit_exam_report() in the "IMPERSONATION ACTOR ATTRIBUTION" section
-- near the end of this file: without this, an owner impersonating a doctor
-- would submit under their own id instead of the doctor's.
CREATE OR REPLACE FUNCTION public.submit_exam_for_review(
  p_course_id     UUID,
  p_track         TEXT,
  p_year          TEXT,
  p_exam_type     TEXT,
  p_pages         INTEGER,
  p_storage_path  TEXT,
  p_original_name TEXT,
  p_mime_type     TEXT,
  p_size_bytes    BIGINT
)
RETURNS public.exam_submissions AS $$
DECLARE
  course_record      public.courses;
  submission_record  public.exam_submissions;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  IF NOT public.is_doctor() THEN
    RAISE EXCEPTION 'Only a doctor may submit an exam for review';
  END IF;

  -- ELIGIBILITY: catches an owner impersonating a student/committee_admin/
  -- admin here, which is_doctor() above cannot (always true for the owner).
  IF NOT public.is_target_role(v_actor_id, 'doctor') THEN
    RAISE EXCEPTION 'The acting user is not a doctor';
  END IF;

  SELECT * INTO course_record FROM public.courses WHERE id = p_course_id;
  IF course_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown course';
  END IF;

  IF p_mime_type <> 'application/pdf' OR p_size_bytes <= 0 OR p_size_bytes > 26214400 THEN
    RAISE EXCEPTION 'Only PDF files up to 25 MB are accepted';
  END IF;

  -- PERMISSION (storage): left on auth.uid(), not v_actor_id.
  -- exam_submissions_pending_doctor_upload (below) still keys the upload
  -- path to the real caller's folder — untouched, per the "only the actor
  -- attribution inside these RPCs changes" boundary — so the file
  -- physically cannot land anywhere else regardless of impersonation.
  IF p_storage_path NOT LIKE auth.uid()::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid submission storage path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'exam-submissions-pending' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  -- major/semester are derived from the course record rather than taken as
  -- parameters, so a submission can never disagree with its own course_id —
  -- the task's metadata list for this flow is course/track/year/exam_type/
  -- pages, not major/semester separately.
  --
  -- ACTOR: uploader_id = v_actor_id, not auth.uid(). This INSERT fires
  -- exam_submissions' own audit_exam_submissions_change trigger (section 3
  -- above), which runs this file's audit_portal_change() and so records
  -- impersonated_by automatically.
  INSERT INTO public.exam_submissions (
    uploader_id, course_id, course_title, course_title_fr, major, semester,
    track, year, exam_type, pages, storage_path, original_name, mime_type,
    size_bytes, status
  ) VALUES (
    v_actor_id, p_course_id, course_record.title, course_record.title_fr,
    course_record.major, course_record.semester, COALESCE(p_track, 'french'),
    p_year, p_exam_type, COALESCE(p_pages, 1), p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, 'pending'
  )
  RETURNING * INTO submission_record;

  RETURN submission_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

-- Approves a pending submission: creates the live previous_exams row and
-- closes out the submission in ONE transaction (the atomicity the task
-- brief calls out explicitly — a client issuing "INSERT previous_exams"
-- and "UPDATE exam_submissions" as two separate calls could leave the
-- submission stuck 'pending' after the live exam already exists, or vice
-- versa if the second call fails).
--
-- p_final_storage_path is required and is NOT the submission's own
-- storage_path: this table's storage_path lives in the private
-- exam-submissions-pending bucket (see storage policies below), which is
-- deliberately unreachable through the live exam path (exam-papers,
-- request_exam_download()). Postgres cannot move bytes between Storage
-- buckets — only the Storage API can — so moving the file into exam-papers
-- has to happen in application code BEFORE this RPC is called, and the
-- resulting exam-papers path is what gets passed in here. See
-- supabase/functions/approve-exam-submission for that step; this function
-- does not touch storage.objects at all, only public.previous_exams and
-- public.exam_submissions.
CREATE OR REPLACE FUNCTION public.approve_exam_submission(
  p_submission_id      UUID,
  p_final_storage_path TEXT,
  p_final_course_id    UUID DEFAULT NULL,
  p_final_track        TEXT DEFAULT NULL,
  p_final_year         TEXT DEFAULT NULL,
  p_final_exam_type    TEXT DEFAULT NULL,
  p_final_pages        INTEGER DEFAULT NULL
)
RETURNS public.previous_exams AS $$
DECLARE
  submission_record public.exam_submissions;
  course_record     public.courses;
  final_course_id   UUID;
  exam_record       public.previous_exams;
  rows_updated      INTEGER;
BEGIN
  IF NOT (public.is_committee_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the committee or an admin may approve a submission';
  END IF;

  -- FOR UPDATE: locks the row so a second, concurrent approve/reject call on
  -- the same submission blocks until this transaction commits, then sees the
  -- already-updated status and correctly raises "already reviewed" instead
  -- of racing to create two previous_exams rows from one submission.
  SELECT * INTO submission_record
  FROM public.exam_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF submission_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown submission';
  END IF;

  IF submission_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission has already been reviewed';
  END IF;

  IF p_final_storage_path IS NULL OR btrim(p_final_storage_path) = '' THEN
    RAISE EXCEPTION 'A final storage path in the live exam-papers bucket is required';
  END IF;

  final_course_id := COALESCE(p_final_course_id, submission_record.course_id);
  IF final_course_id IS NULL THEN
    RAISE EXCEPTION 'A course is required';
  END IF;

  SELECT * INTO course_record FROM public.courses WHERE id = final_course_id;
  IF course_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown course';
  END IF;

  INSERT INTO public.previous_exams (
    course_id, course_title, course_title_fr, major, semester, year,
    exam_type, pages, track, file_url
  ) VALUES (
    final_course_id, course_record.title, course_record.title_fr,
    course_record.major, course_record.semester,
    COALESCE(p_final_year, submission_record.year),
    COALESCE(p_final_exam_type, submission_record.exam_type),
    COALESCE(p_final_pages, submission_record.pages),
    COALESCE(p_final_track, submission_record.track),
    p_final_storage_path
  )
  RETURNING * INTO exam_record;

  UPDATE public.exam_submissions
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      approved_exam_id = exam_record.id
  WHERE id = p_submission_id;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'Could not finalize the submission review';
  END IF;

  RETURN exam_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reject_exam_submission(
  p_submission_id    UUID,
  p_rejection_reason TEXT
)
RETURNS public.exam_submissions AS $$
DECLARE
  submission_record public.exam_submissions;
  rows_updated      INTEGER;
BEGIN
  IF NOT (public.is_committee_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the committee or an admin may reject a submission';
  END IF;

  IF p_rejection_reason IS NULL OR char_length(btrim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO submission_record
  FROM public.exam_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF submission_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown submission';
  END IF;

  IF submission_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Submission has already been reviewed';
  END IF;

  UPDATE public.exam_submissions
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = NOW(),
      rejection_reason = btrim(p_rejection_reason)
  WHERE id = p_submission_id
  RETURNING * INTO submission_record;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  IF rows_updated <> 1 THEN
    RAISE EXCEPTION 'Could not finalize the submission review';
  END IF;

  RETURN submission_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

-- No INSERT policy: submit_exam_for_review() (SECURITY DEFINER) is the only
-- write path for a doctor's own submission, exactly like 008's
-- submit_assignment()/assignment_submissions and 011's
-- submit_exam_report()/exam_reports.
CREATE POLICY "exam_submissions_select_own"
  ON public.exam_submissions FOR SELECT
  USING (uploader_id = auth.uid());

CREATE POLICY "exam_submissions_select_committee_or_admin"
  ON public.exam_submissions FOR SELECT
  USING (public.is_committee_admin() OR public.is_admin());

-- WHO may attempt an UPDATE is gated here; approve/reject only ever happen
-- through approve_exam_submission()/reject_exam_submission() above (both
-- SECURITY DEFINER), so this policy is really "who can invoke those two
-- functions and have their UPDATE land". Unlike 011's exam_reports, nothing
-- about exam_submissions is ever edited by its own uploader after creation,
-- so there is no need for a column-restriction trigger here.
CREATE POLICY "exam_submissions_update_committee_or_admin"
  ON public.exam_submissions FOR UPDATE
  USING (public.is_committee_admin() OR public.is_admin())
  WITH CHECK (public.is_committee_admin() OR public.is_admin());

-- No DELETE policy: only owner_full_access_exam_submissions (section 5)
-- reaches DELETE — default-deny-by-omission, same as every other table in
-- 008/009/011.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_submissions TO authenticated;

REVOKE ALL ON FUNCTION public.can_read_exam_submission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_exam_submission(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_exam_for_review(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_for_review(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_exam_submission(UUID, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_exam_submission(UUID, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_exam_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_exam_submission(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- STORAGE — dedicated pending bucket, isolated from the live exam path
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-submissions-pending', 'exam-submissions-pending', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "exam_submissions_pending_doctor_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exam-submissions-pending'
    AND public.is_doctor()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "exam_submissions_pending_authorized_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-submissions-pending' AND public.can_read_exam_submission(name));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. STUDENT COUNCIL (committee_admin) POWERS
-- ═══════════════════════════════════════════════════════════════════════════
-- 001 restricted previous_exams/entrance_exams/events writes to is_admin()
-- only; 008 only ever touched previous_exams' SELECT policy (see that
-- table's history in section 2 of this file's predecessor). Widen all three
-- tables' INSERT/UPDATE/DELETE to also allow committee_admin, and rename
-- away from the now-inaccurate "_admin" suffix so a future reader is not
-- misled into thinking these stayed admin-only. Approve/reject on the
-- review queue is already covered by exam_submissions_update_committee_or_
-- admin in section 3 — nothing further needed for that half of this
-- requirement.
--
-- No GRANT changes needed here: 001 already grants ALL on these three
-- tables to `authenticated` (the RLS policies below are what was actually
-- restricting committee_admin, not the table-level grant) — same as every
-- other role-gated table in 001/008/009/011.

DROP POLICY IF EXISTS "previous_exams_insert_admin" ON public.previous_exams;
CREATE POLICY "previous_exams_insert_staff"
  ON public.previous_exams FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "previous_exams_update_admin" ON public.previous_exams;
CREATE POLICY "previous_exams_update_staff"
  ON public.previous_exams FOR UPDATE
  USING (public.is_admin() OR public.is_committee_admin())
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "previous_exams_delete_admin" ON public.previous_exams;
CREATE POLICY "previous_exams_delete_staff"
  ON public.previous_exams FOR DELETE
  USING (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "entrance_exams_insert_admin" ON public.entrance_exams;
CREATE POLICY "entrance_exams_insert_staff"
  ON public.entrance_exams FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "entrance_exams_update_admin" ON public.entrance_exams;
CREATE POLICY "entrance_exams_update_staff"
  ON public.entrance_exams FOR UPDATE
  USING (public.is_admin() OR public.is_committee_admin())
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "entrance_exams_delete_admin" ON public.entrance_exams;
CREATE POLICY "entrance_exams_delete_staff"
  ON public.entrance_exams FOR DELETE
  USING (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "events_insert_admin" ON public.events;
CREATE POLICY "events_insert_staff"
  ON public.events FOR INSERT
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "events_update_admin" ON public.events;
CREATE POLICY "events_update_staff"
  ON public.events FOR UPDATE
  USING (public.is_admin() OR public.is_committee_admin())
  WITH CHECK (public.is_admin() OR public.is_committee_admin());

DROP POLICY IF EXISTS "events_delete_admin" ON public.events;
CREATE POLICY "events_delete_staff"
  ON public.events FOR DELETE
  USING (public.is_admin() OR public.is_committee_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. OWNER FULL ACCESS — applied last so it covers every table created above
--    EXCEPT impersonation_sessions, which stays excluded on purpose (see
--    section 1): it is part of the accountability trail, not a data table,
--    and must remain un-editable even by the owner, exactly like audit_logs.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM public.grant_owner_full_access('doctor_courses');
  PERFORM public.grant_owner_full_access('exam_submissions');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. IMPERSONATION ACTOR ATTRIBUTION — student/doctor self-service RPCs
-- ═══════════════════════════════════════════════════════════════════════════
-- Section 1 shipped effective_user_id() but deliberately wired it into
-- nothing — the design note there argues that retrofitting it into RLS
-- policies or role-check helpers (is_admin()/is_doctor()/etc.) is unsafe.
-- That argument still holds and is UNCHANGED by this section.
--
-- What it missed: a handful of pre-existing SECURITY DEFINER functions
-- don't gate a PERMISSION decision at all — they gate one, then separately
-- hardcode auth.uid() a second time as the ACTOR a row gets attributed to
-- (student_id, reporter_id, uploader_id). Left alone, "full write as them"
-- silently degrades to "write as yourself, while claiming to be them": an
-- owner impersonating a student who submits an assignment gets a submission
-- attributed to the OWNER, so it never shows up under the student's name in
-- a doctor's grading view. This section fixes exactly that, and only that —
-- the functions below, nothing wider.
--
-- Every function touched keeps its EXACT original signature (parameter
-- names included, not just types — Supabase's PostgREST resolves .rpc()
-- calls by parameter name, so renaming one would silently break whatever
-- frontend code already calls it). Only function BODIES change.
--
-- ── Systematic audit: every auth.uid() across 008-012, and the verdict ──────
-- (found via `grep auth\.uid\(\)` over each file, not from memory, per the
-- brief this section implements)
--
--   PERMISSION checks — real identity, left untouched (this is the correct,
--   required behaviour, not an oversight):
--     - has_role(), is_doctor(), is_committee_admin(), is_verified_student(),
--       is_admin(), is_owner() (001/008/009) — the exact set the brief named
--       as off-limits.
--     - assignment_visible_to_current_student() (008) — backs the
--       assignments_select_doctor_or_student RLS policy directly; left
--       untouched, and a separate p_student_id-parameterised sibling
--       (assignment_visible_to_student(), below) was added instead of
--       touching this one.
--     - current_student_course_ids() (009) — backs
--       materials_select_student_doctor_admin RLS policy; not used by any
--       function this section touches, left untouched.
--     - can_read_print_file(), can_read_assignment_attachment(),
--       can_read_submission_file(), can_read_material() (008/009) — all
--       storage-policy predicates (who may read), not actor attribution.
--       Left untouched.
--     - sync_student_academics() (009) — "Service role only: auth.uid() is
--       NULL when called with the service key" — not a user-facing RPC at
--       all (called only by the university-sync Edge Function under the
--       service role), out of scope.
--     - restrict_exam_report_review_fields() (011) — checks
--       `NEW.reporter_id IS DISTINCT FROM auth.uid() AND NOT is_owner()`.
--       AUDITED, not modified: traced through both the impersonating-owner
--       re-report case and the real-student re-report case by hand (see the
--       report accompanying this migration for the full trace); its
--       existing `AND NOT public.is_owner()` escape hatch already makes it
--       correct once reporter_id is set via effective_user_id() at INSERT
--       time — no change needed.
--     - All RLS/storage-policy USING/WITH CHECK clauses across 001-012
--       (dozens) — every single one left untouched, per the design note in
--       section 1.
--
--   ACTOR attribution — changed to route through effective_user_id():
--     - submit_assignment() (008): student_id, the attempt-count query.
--     - submit_exam_report() (011): reporter_id (and, transitively, the
--       ON CONFLICT (previous_exam_id, reporter_id, kind) target, which
--       needs no code change — it keys off whatever value is inserted).
--     - submit_exam_for_review() (this file, section 3): uploader_id — not
--       named in the brief (it names STUDENT actors specifically) but
--       identical bug class, in code from earlier in this same file/
--       session, so fixed in place above rather than left inconsistent.
--
--   Reviewed, deliberately left on auth.uid() (not an actor-attribution
--   case, or attribution to the real identity is the safer/more correct
--   choice):
--     - submit_assignment() / submit_exam_for_review(): the storage-path
--       LIKE check. Both buckets' own upload policies (assignment-
--       submissions in 008, exam-submissions-pending in section 3 of this
--       file) still key the allowed path to auth.uid()'s folder — untouched,
--       since storage policies are policies, off-limits under the same
--       design-note reasoning as RLS. A file impersonation-uploads always
--       physically lands under the real caller's folder; requiring
--       v_actor_id in these checks would reject every impersonated
--       submission outright. Known, accepted side effect: the storage
--       folder name and the row's student_id/uploader_id can disagree while
--       impersonating. Cosmetic, not a security issue — read access is
--       governed by can_read_submission_file()/can_read_exam_submission(),
--       which check the DB row, not the folder path.
--     - log_session_file_access() (008): actor_id in its direct audit_logs
--       INSERT. Kept on auth.uid() for consistency with actor_id's meaning
--       everywhere else in this system (audit_portal_change()/
--       audit_owner_write() in section 1 also never swap actor_id — only
--       metadata.impersonated_by carries the target). This function doesn't
--       attribute any row to a student in the first place (no student_id-
--       style column exists on audit_logs), so there is no "wrong person"
--       bug to fix here — only a missing impersonated_by, added below.
--     - request_exam_download() (011): full reasoning below — deliberately
--       NOT modified.
--
-- ── request_exam_download() — reviewed, deliberately unchanged ─────────────
-- The brief asks specifically: should an impersonated download consume the
-- TARGET student's quota, or the OWNER's own? Decision: neither literally
-- happens today, and this section leaves that exact status quo in place.
--
-- v_privileged := is_admin() OR is_committee_admin() already exempts the
-- owner from the quota entirely, unconditionally, regardless of who they
-- are impersonating — that check is a PERMISSION predicate on the real
-- caller and is correctly out of scope for this section (see the design
-- note in section 1: is_admin() must keep resolving against the real JWT).
-- So the owner is never throttled either way, and "charge the owner's own
-- quota" costs the owner nothing extra to begin with — the two options the
-- brief poses are not actually symmetric once that's accounted for.
--
-- That leaves only the ledger row's user_id — a bookkeeping/forensic
-- question, not a fairness one. Charging it to v_actor_id (the target)
-- would pollute a real student's own download history with staff-initiated
-- downloads made on their behalf, making it look like the student personally
-- hit a given exam multiple times when they did not — actively misleading
-- for the support/investigation purpose exam_download_events exists for.
-- Charging it to auth.uid() (the real caller, i.e. today's unchanged
-- behaviour) keeps that ledger honest. exam_download_events also has no
-- audit_portal_change()-style trigger at all (011 built it as a deliberately
-- minimal, dedicated ledger — see its own GRANTS comment) and this section
-- does not add one; retrofitting impersonated_by plumbing into a table 011
-- explicitly kept minimal, for a case where nothing is actually being
-- misattributed, was judged not worth the added surface.
-- Net decision: request_exam_download() is not touched by this migration.

-- Parameterised sibling of assignment_visible_to_current_student() (008),
-- which stays untouched because it backs an RLS policy directly (see the
-- audit above). This version takes the student to check visibility for as
-- an explicit argument instead of reading auth.uid() internally, so
-- submit_assignment() below can evaluate it against the ACTING identity
-- (impersonation target or real caller) rather than always the real caller.
-- Same "not granted to authenticated" reasoning as is_target_role() in
-- section 2: only ever called from inside another SECURITY DEFINER
-- function, never from a policy.
CREATE OR REPLACE FUNCTION public.assignment_visible_to_student(p_assignment_id UUID, p_student_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    JOIN public.profiles student ON student.id = p_student_id
    WHERE assignment.id = p_assignment_id
      AND assignment.published_at IS NOT NULL
      AND public.is_target_role(p_student_id, 'student')
      AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
      AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
      AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.assignment_visible_to_student(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ACTOR/PERMISSION split — see the audit above for the full reasoning.
-- auth.uid()/is_verified_student() decide who may CALL this function
-- (PERMISSION, real identity, unchanged). v_actor_id decides who the
-- resulting submission is ATTRIBUTED to (impersonated target if a session
-- is active, else auth.uid() — a no-op for every normal, non-impersonated
-- call). This is the actual fix: previously student_id was always
-- auth.uid(), so an impersonated submission was silently attributed to the
-- owner instead of the student being impersonated.
CREATE OR REPLACE FUNCTION public.submit_assignment(
  p_assignment_id UUID,
  p_storage_path TEXT,
  p_original_name TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT,
  p_message TEXT DEFAULT ''
)
RETURNS public.assignment_submissions AS $$
DECLARE
  assignment_record public.assignments;
  next_attempt INTEGER;
  submission_record public.assignment_submissions;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  -- PERMISSION: real caller. is_verified_student() already returns TRUE for
  -- the owner unconditionally (via is_admin()), which is what lets an
  -- impersonating owner reach this function at all.
  IF auth.uid() IS NULL OR NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  -- ELIGIBILITY: the acting identity must actually be a student — catches
  -- an owner impersonating a doctor/admin here, which is_verified_student()
  -- above cannot (always true for the owner).
  IF NOT public.is_target_role(v_actor_id, 'student') THEN
    RAISE EXCEPTION 'The acting user is not a student';
  END IF;

  SELECT * INTO assignment_record
  FROM public.assignments
  WHERE id = p_assignment_id;

  -- ACTOR: visibility (major/semester/track targeting) is evaluated against
  -- the acting student's own profile via assignment_visible_to_student(),
  -- not assignment_visible_to_current_student() (RLS-backed, untouched).
  IF assignment_record.id IS NULL OR NOT public.assignment_visible_to_student(p_assignment_id, v_actor_id) THEN
    RAISE EXCEPTION 'Assignment is not available to this student';
  END IF;

  IF assignment_record.due_at IS NOT NULL
    AND assignment_record.due_at < NOW()
    AND NOT assignment_record.allow_late THEN
    RAISE EXCEPTION 'The submission deadline has passed';
  END IF;

  IF p_mime_type <> 'application/pdf' OR p_size_bytes <= 0 OR p_size_bytes > 26214400 THEN
    RAISE EXCEPTION 'Only PDF files up to 25 MB are accepted';
  END IF;

  -- PERMISSION (storage): left on auth.uid() — see the audit above for why
  -- (the storage policy itself is unchanged and still keys the path to the
  -- real caller's folder).
  IF p_storage_path NOT LIKE auth.uid()::TEXT || '/' || p_assignment_id::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid submission storage path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'assignment-submissions' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  -- ACTOR: attempt count is per-student, counted against the identity the
  -- submission will be attributed to.
  SELECT COUNT(*) + 1 INTO next_attempt
  FROM public.assignment_submissions
  WHERE assignment_id = p_assignment_id AND student_id = v_actor_id;

  IF next_attempt > assignment_record.max_submissions THEN
    RAISE EXCEPTION 'Maximum submission count reached';
  END IF;

  -- ACTOR: student_id = v_actor_id — the actual fix. This INSERT fires
  -- assignment_submissions' existing audit_assignment_submissions_change
  -- trigger (008), which now runs this file's audit_portal_change() and so
  -- records impersonated_by automatically — no extra logging needed here.
  INSERT INTO public.assignment_submissions (
    assignment_id, student_id, attempt_number, storage_path, original_name,
    mime_type, size_bytes, message, status
  ) VALUES (
    p_assignment_id, v_actor_id, next_attempt, p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, COALESCE(p_message, ''),
    CASE WHEN assignment_record.due_at IS NOT NULL AND assignment_record.due_at < NOW()
      THEN 'late' ELSE 'submitted' END
  ) RETURNING * INTO submission_record;

  RETURN submission_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

-- 008 never revoked PUBLIC's default EXECUTE on submit_assignment (it
-- predates the REVOKE-then-GRANT convention 009's postmortem established —
-- see this file's own header comment). Not currently exploitable (auth.uid()
-- IS NULL fails first for any anon caller), but closing it while this
-- function is already being touched costs nothing and matches the standard
-- this file holds everywhere else.
REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;

-- Same ACTOR/PERMISSION split as submit_assignment() above, applied to
-- reporter_id instead of student_id.
CREATE OR REPLACE FUNCTION public.submit_exam_report(
  p_previous_exam_id UUID,
  p_kind             TEXT,
  p_problem_type     TEXT DEFAULT NULL,
  p_quality_rating   SMALLINT DEFAULT NULL,
  p_message          TEXT DEFAULT ''
)
RETURNS public.exam_reports AS $$
DECLARE
  v_report public.exam_reports;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  -- PERMISSION: real caller — see submit_assignment() above.
  IF auth.uid() IS NULL OR NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  -- ELIGIBILITY: see submit_assignment() above.
  IF NOT public.is_target_role(v_actor_id, 'student') THEN
    RAISE EXCEPTION 'The acting user is not a student';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.previous_exams WHERE id = p_previous_exam_id) THEN
    RAISE EXCEPTION 'Unknown exam';
  END IF;

  IF p_kind NOT IN ('problem', 'quality') THEN
    RAISE EXCEPTION 'kind must be problem or quality';
  END IF;

  -- ACTOR: reporter_id = v_actor_id — the actual fix. The
  -- ON CONFLICT (previous_exam_id, reporter_id, kind) target needs no
  -- change: it naturally keys off whatever value is inserted, so a second
  -- report from the same acting identity still correctly upserts instead of
  -- duplicating (traced by hand for both the impersonating-owner re-report
  -- case and the real-student re-report case — see the audit above re:
  -- restrict_exam_report_review_fields(), which this interacts with).
  -- This INSERT fires exam_reports' existing audit_exam_reports_change
  -- trigger (011), which now runs this file's audit_portal_change() and so
  -- records impersonated_by automatically.
  INSERT INTO public.exam_reports (
    previous_exam_id, reporter_id, kind, problem_type, quality_rating, message, status
  ) VALUES (
    p_previous_exam_id, v_actor_id, p_kind, p_problem_type, p_quality_rating,
    COALESCE(p_message, ''), 'open'
  )
  ON CONFLICT (previous_exam_id, reporter_id, kind)
  DO UPDATE SET
    problem_type   = EXCLUDED.problem_type,
    quality_rating = EXCLUDED.quality_rating,
    message        = EXCLUDED.message,
    status         = 'open',
    resolved_by    = NULL,
    resolved_at    = NULL
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- No REVOKE/GRANT reissue needed here: 011 already applied REVOKE-then-GRANT
-- to submit_exam_report, and CREATE OR REPLACE preserves a function's
-- existing grants untouched — only the body above changed.

-- log_session_file_access() does not attribute any row to a student
-- identity (see the audit above) — actor_id stays auth.uid(), for
-- consistency with what actor_id means everywhere else in this system. The
-- only change is adding impersonated_by, which — unlike submit_assignment()/
-- submit_exam_report() above — cannot be inherited from a trigger, because
-- this function writes audit_logs directly rather than writing a table that
-- has audit_portal_change() attached to it.
CREATE OR REPLACE FUNCTION public.log_session_file_access(p_storage_path TEXT)
RETURNS VOID AS $$
DECLARE
  exam_id        UUID;
  impersonation  public.impersonation_sessions;
  extra_metadata JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  SELECT id INTO exam_id
  FROM public.previous_exams
  WHERE file_url = p_storage_path;

  IF exam_id IS NULL THEN
    RAISE EXCEPTION 'Unknown session file';
  END IF;

  SELECT * INTO impersonation
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF impersonation.id IS NOT NULL THEN
    extra_metadata := jsonb_build_object(
      'impersonated_by', jsonb_build_object(
        'owner_id', impersonation.owner_id,
        'target_user_id', impersonation.target_user_id,
        'session_id', impersonation.id
      )
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'opened', 'session_file', exam_id, extra_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Same pre-existing gap as submit_assignment above: 008 never revoked
-- PUBLIC's default EXECUTE here either. Closing it for the same reason.
REVOKE ALL ON FUNCTION public.log_session_file_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_session_file_access(TEXT) TO authenticated;
