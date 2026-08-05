-- EduSphere v2 — migration 009
--
-- Adds:
--   1. Owner tier  — a single super-administrator with unconditional read/write
--      on every table, every action audited and non-suppressible.
--   2. Academics   — student enrolments and weekly schedule, synced from the
--      university API by a service-role Edge Function. No file numbers and no
--      raw university payloads are ever persisted.
--   3. Resources   — doctor-published course materials plus a unified
--      `course_resources` view spanning exams, books, materials and assignments.
--   4. Telemetry   — first-party event collection (see docs/PRIVACY.md).
--
-- Conventions follow 008: SECURITY DEFINER + STABLE + `SET search_path` on all
-- predicate helpers, audit triggers via public.audit_portal_change().
--
-- AMENDED (still pre-launch, never executed against any database — edited in
-- place rather than patched with a follow-up migration): a business-logic
-- audit of sync_student_academics() found it treated "what the university
-- said this minute" as complete and authoritative when it may be partial,
-- transient, or reshaped. Fixed here: (1) an empty/reshaped schedule
-- response no longer wipes an existing timetable — see the
-- p_schedule_authoritative comment on the function; (2) academic_sync_state
-- now records real 'partial'/'failed' statuses plus which course codes
-- failed to resolve, instead of a hardcoded 'ok'; (3) enrolments absent from
-- an authoritative feed for a (year, semester) are retired (status
-- 'withdrawn'), scoped so history in other terms is never touched and a
-- non-authoritative sync never retires anything. A fourth and fifth defect —
-- the schedule UI stacking every synced term, and a routine profile refresh
-- silently revoking assignment visibility via migration 008's
-- assignment_visible_to_current_student() — are fixed outside this file (the
-- former in src/pages/Schedule.tsx + src/services/academics.ts; the latter
-- partially in the Edge Function, with the durable fix flagged as
-- out-of-scope 008 work — see the sync function's Edge Function caller for
-- both).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. OWNER TIER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.owner_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.owner_emails IS
  'Super-administrators. Bypasses every RLS policy. Writable only by the service role — never by the application, not even by an owner.';

-- Owner identity is keyed to the verified JWT email rather than to a profile
-- row, so it cannot be escalated by editing profiles.role.
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_emails
    WHERE email = lower(auth.jwt() ->> 'email')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Every existing privilege predicate now answers TRUE for the owner, so the
-- owner inherits admin, doctor and committee surfaces without a profile edit.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.is_owner() OR EXISTS (
    SELECT 1 FROM public.admin_emails
    WHERE email = auth.jwt() ->> 'email'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

INSERT INTO public.owner_emails (email, note)
VALUES ('elietecovery@gmail.com', 'Primary system owner')
ON CONFLICT (email) DO NOTHING;

-- Owner writes are audited before they are allowed to land.
CREATE OR REPLACE FUNCTION public.audit_owner_write()
RETURNS TRIGGER AS $$
DECLARE
  row_data  JSONB;
  target_id UUID;
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
    )
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attaches an unconditional owner ALL-policy plus the owner audit trigger to a
-- table. Applied to every application table at the end of this migration.
CREATE OR REPLACE FUNCTION public.grant_owner_full_access(p_table TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  EXECUTE format(
    'DROP POLICY IF EXISTS %I ON public.%I',
    'owner_full_access_' || p_table, p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL USING (public.is_owner()) WITH CHECK (public.is_owner())',
    'owner_full_access_' || p_table, p_table
  );

  EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
    'audit_owner_write_' || p_table, p_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_owner_write()',
    'audit_owner_write_' || p_table, p_table
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SECURITY: this function runs arbitrary DDL (ALTER TABLE / CREATE POLICY /
-- CREATE TRIGGER) against any table name it is given, as SECURITY DEFINER.
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- let any anon/authenticated caller invoke it directly (e.g. to re-arm RLS +
-- an owner-only policy on an arbitrary table, locking out every other role —
-- a self-service denial-of-service). It is only ever meant to be called from
-- this migration's own DO block below, so strip the public grant immediately.
REVOKE ALL ON FUNCTION public.grant_owner_full_access(TEXT) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ACADEMICS — enrolments + schedule
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.student_enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  academic_year  TEXT NOT NULL,
  semester       TEXT NOT NULL
    CHECK (semester IN ('LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9')),
  status         TEXT NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'completed', 'withdrawn', 'failed')),
  -- Grades arrive from the university API; nullable because most feeds omit
  -- them for in-progress courses.
  grade          NUMERIC(5,2) CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100)),
  source         TEXT NOT NULL DEFAULT 'university'
    CHECK (source IN ('university', 'manual')),
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, course_id, academic_year, semester)
);

CREATE TRIGGER set_student_enrollments_updated_at
  BEFORE UPDATE ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_enrollments_student_status ON public.student_enrollments(student_id, status);
CREATE INDEX idx_enrollments_course ON public.student_enrollments(course_id);

CREATE TABLE public.schedule_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id      UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  -- Denormalised so a schedule still renders when the university feed contains
  -- a course we have not catalogued yet.
  course_label   TEXT NOT NULL,
  academic_year  TEXT NOT NULL,
  semester       TEXT NOT NULL
    CHECK (semester IN ('LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9')),
  day_of_week    SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- ISO-8601: 1 = Monday
  starts_at      TIME NOT NULL,
  ends_at        TIME NOT NULL,
  room           TEXT NOT NULL DEFAULT '',
  instructor     TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL DEFAULT 'lecture'
    CHECK (kind IN ('lecture', 'td', 'tp', 'exam', 'other')),
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TRIGGER set_schedule_entries_updated_at
  BEFORE UPDATE ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_schedule_student_day ON public.schedule_entries(student_id, day_of_week, starts_at);

-- Records that a sync happened, never what the university returned.
CREATE TABLE public.academic_sync_state (
  student_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status    TEXT NOT NULL DEFAULT 'ok' CHECK (last_status IN ('ok', 'failed', 'partial')),
  -- The (year, semester) this row's status/counts describe — the term the
  -- most recent sync call targeted. Lets a client show "which term is
  -- current" from a single authoritative row instead of guessing from
  -- schedule_entries, and instead of profiles.semester, which — after the
  -- fix in sync_student_academics() below — may deliberately stop tracking
  -- the university once set.
  academic_year  TEXT,
  semester       TEXT,
  entry_count    INTEGER NOT NULL DEFAULT 0,
  course_count   INTEGER NOT NULL DEFAULT 0,
  -- Enrolment course codes the university fed us that did not resolve to a
  -- row in public.courses. Previously dropped with a silent CONTINUE and no
  -- trace anywhere — a student whose courses failed to resolve saw an empty
  -- "My Courses" next to a cheerful, unqualified "last synced" timestamp.
  -- Codes are catalogue identifiers (e.g. "ACC301"), not personal data, so
  -- they are safe to retain for staff triage — unlike a file number or a raw
  -- university payload, which this migration never persists anywhere.
  unmatched_course_count INTEGER NOT NULL DEFAULT 0,
  unmatched_course_codes TEXT[] NOT NULL DEFAULT '{}'
);

-- Replaces a student's academic snapshot atomically. Called only by the
-- university-sync Edge Function under the service role.
--
-- p_schedule_authoritative / p_enrollments_authoritative (business-logic
-- audit fix, folded in before this migration ever ran — see the five
-- defects below): whether the caller's raw university response actually had
-- the SHAPE of a real answer — an `entries`/`courses` array present, even if
-- empty — as opposed to a response missing that key entirely or reshaped by
-- an outage, a maintenance window, or a contract change. This is computed by
-- the Edge Function from the RAW payload (Array.isArray(payload.entries) /
-- Array.isArray(payload.courses)) and passed in explicitly, because by the
-- time p_schedule/p_enrollments reach this function, parseSchedule() /
-- parseEnrollments() have already collapsed "the key was missing" and "the
-- key was a genuinely empty array" into the identical JSONB `[]` — that
-- distinction is gone from the data itself, so SQL cannot recover it no
-- matter how it inspects p_schedule/p_enrollments. Guessing here (e.g.
-- "empty array = the fetch failed") would be wrong on exactly the day it
-- matters most: a real semester boundary, when an empty timetable or course
-- list is completely normal. Both default to FALSE — fail closed — so any
-- future caller that forgets to pass them explicitly gets the SAFE (do not
-- destroy) behaviour, never the destructive one.
CREATE OR REPLACE FUNCTION public.sync_student_academics(
  p_student_id                UUID,
  p_academic_year              TEXT,
  p_semester                   TEXT,
  p_enrollments                JSONB,
  p_schedule                   JSONB,
  p_schedule_authoritative     BOOLEAN DEFAULT FALSE,
  p_enrollments_authoritative  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  enrollment          JSONB;
  entry               JSONB;
  resolved_course     UUID;
  course_total        INTEGER := 0;
  entry_total         INTEGER := 0;
  retired_total        INTEGER := 0;
  unmatched_total      INTEGER := 0;
  unmatched_codes      TEXT[] := '{}';
  current_course_ids   UUID[] := '{}';
  computed_status       TEXT;
  -- Defensive: a NULL boolean must still branch as "not authoritative", not
  -- as an error or an accidental TRUE. Everything below reads these locals,
  -- never the raw parameters.
  v_schedule_ok       BOOLEAN := COALESCE(p_schedule_authoritative, FALSE);
  v_enrollments_ok    BOOLEAN := COALESCE(p_enrollments_authoritative, FALSE);
BEGIN
  -- Service role only: auth.uid() is NULL when called with the service key.
  IF auth.uid() IS NOT NULL AND NOT public.is_owner() THEN
    RAISE EXCEPTION 'sync_student_academics is service-role only';
  END IF;

  -- ── Enrolments ─────────────────────────────────────────────────────────
  -- Gated on v_enrollments_ok end-to-end (merge AND retirement): an
  -- unauthoritative feed is not selectively trusted for the additive half
  -- and distrusted only for the destructive half — a reshaped/broken
  -- response could just as easily carry a wrong status or grade for a real
  -- course as it could omit one. When not authoritative this call makes NO
  -- enrolment writes at all and the prior snapshot stands untouched.
  IF v_enrollments_ok THEN
    FOR enrollment IN SELECT * FROM jsonb_array_elements(COALESCE(p_enrollments, '[]'::JSONB))
    LOOP
      SELECT id INTO resolved_course
      FROM public.courses
      WHERE code = (enrollment ->> 'course_code')
      LIMIT 1;

      IF resolved_course IS NULL THEN
        -- Previously a silent CONTINUE. Now counted and named — see the
        -- comment on academic_sync_state.unmatched_course_codes above.
        unmatched_total := unmatched_total + 1;
        unmatched_codes := array_append(
          unmatched_codes, COALESCE(enrollment ->> 'course_code', '(missing course_code)')
        );
        CONTINUE;
      END IF;

      INSERT INTO public.student_enrollments (
        student_id, course_id, academic_year, semester, status, grade, source, synced_at
      ) VALUES (
        p_student_id,
        resolved_course,
        p_academic_year,
        COALESCE(enrollment ->> 'semester', p_semester),
        COALESCE(enrollment ->> 'status', 'enrolled'),
        NULLIF(enrollment ->> 'grade', '')::NUMERIC,
        'university',
        NOW()
      )
      ON CONFLICT (student_id, course_id, academic_year, semester)
      DO UPDATE SET
        status    = EXCLUDED.status,
        grade     = EXCLUDED.grade,
        synced_at = NOW();

      course_total := course_total + 1;

      -- Track which courses the feed placed in THIS call's target term, so
      -- the retirement step below knows what is still current. The INSERT
      -- above always writes academic_year = p_academic_year, so the only
      -- axis left to check is the same per-record semester fallback it used.
      IF COALESCE(enrollment ->> 'semester', p_semester) = p_semester THEN
        current_course_ids := array_append(current_course_ids, resolved_course);
      END IF;
    END LOOP;

    -- Retire enrolments that were 'enrolled' for THIS exact (year, semester)
    -- but have disappeared from the feed — a dropped course must stop
    -- granting access to that course's materials via
    -- current_student_course_ids(). Scoped on three independent axes so it
    -- cannot reach outside its lane:
    --   1. academic_year/semester match the term this call is for — a
    --      completed enrolment from a different term is a different row
    --      and is never touched.
    --   2. status = 'enrolled' only — 'completed' / 'failed' / already-
    --      'withdrawn' rows are left alone; this is not a status-downgrade
    --      path for history.
    --   3. The whole enrolments block already required v_enrollments_ok —
    --      an unauthoritative feed retires nothing, or the empty-payload
    --      destruction from defect #1 comes back wearing a different hat.
    UPDATE public.student_enrollments
    SET status = 'withdrawn', synced_at = NOW()
    WHERE student_id = p_student_id
      AND academic_year = p_academic_year
      AND semester = p_semester
      AND status = 'enrolled'
      AND NOT (course_id = ANY (current_course_ids));

    GET DIAGNOSTICS retired_total = ROW_COUNT;
  END IF;

  -- ── Schedule ───────────────────────────────────────────────────────────
  -- The schedule is authoritative per (year, semester): replace, don't
  -- merge, so dropped classes disappear instead of lingering — but ONLY
  -- when v_schedule_ok says this response is trustworthy enough to act on.
  -- An unauthoritative response leaves the existing timetable exactly as it
  -- was rather than deleting it on the strength of a payload we don't
  -- trust. A genuinely empty timetable (school break, exam-only week) still
  -- replaces down to zero rows, because the caller told us the empty array
  -- was the real answer, not a symptom of failure.
  IF v_schedule_ok THEN
    DELETE FROM public.schedule_entries
    WHERE student_id = p_student_id
      AND academic_year = p_academic_year
      AND semester = p_semester;

    FOR entry IN SELECT * FROM jsonb_array_elements(COALESCE(p_schedule, '[]'::JSONB))
    LOOP
      SELECT id INTO resolved_course
      FROM public.courses
      WHERE code = (entry ->> 'course_code')
      LIMIT 1;

      INSERT INTO public.schedule_entries (
        student_id, course_id, course_label, academic_year, semester,
        day_of_week, starts_at, ends_at, room, instructor, kind, synced_at
      ) VALUES (
        p_student_id,
        resolved_course,
        COALESCE(NULLIF(entry ->> 'course_label', ''), entry ->> 'course_code', 'Untitled'),
        p_academic_year,
        p_semester,
        (entry ->> 'day_of_week')::SMALLINT,
        (entry ->> 'starts_at')::TIME,
        (entry ->> 'ends_at')::TIME,
        COALESCE(entry ->> 'room', ''),
        COALESCE(entry ->> 'instructor', ''),
        COALESCE(entry ->> 'kind', 'lecture'),
        NOW()
      );

      entry_total := entry_total + 1;
    END LOOP;
  ELSE
    -- Not authoritative: we wrote nothing, but academic_sync_state.
    -- entry_count is documented (and, elsewhere, trusted) as "how big is
    -- this student's timetable for this term right now", not "how many rows
    -- did this call write". Report the TRUE current count instead of 0, or
    -- a skipped sync would make a perfectly intact timetable look wiped —
    -- the exact false signal defect #1 exists to prevent, just relocated
    -- into the status row instead of the table itself.
    SELECT COUNT(*) INTO entry_total
    FROM public.schedule_entries
    WHERE student_id = p_student_id
      AND academic_year = p_academic_year
      AND semester = p_semester;
  END IF;

  -- ── Status + audit trail ──────────────────────────────────────────────
  -- Real statuses instead of a hardcoded 'ok'. 'failed' means neither half
  -- of this call was trustworthy enough to act on (nothing destroyed,
  -- nothing retired, nothing merged — the prior snapshot stands untouched
  -- end to end); 'partial' covers everything in between (one side
  -- authoritative and the other not, or courses that came back but didn't
  -- resolve against the catalogue); 'ok' only when both feeds were
  -- authoritative and every course code resolved.
  computed_status := CASE
    WHEN NOT v_schedule_ok AND NOT v_enrollments_ok THEN 'failed'
    WHEN v_schedule_ok AND v_enrollments_ok AND unmatched_total = 0 THEN 'ok'
    ELSE 'partial'
  END;

  INSERT INTO public.academic_sync_state (
    student_id, last_synced_at, last_status, academic_year, semester,
    entry_count, course_count, unmatched_course_count, unmatched_course_codes
  )
  VALUES (
    p_student_id, NOW(), computed_status, p_academic_year, p_semester,
    entry_total, course_total, unmatched_total, unmatched_codes
  )
  ON CONFLICT (student_id) DO UPDATE SET
    last_synced_at         = NOW(),
    last_status            = EXCLUDED.last_status,
    academic_year          = EXCLUDED.academic_year,
    semester               = EXCLUDED.semester,
    entry_count            = EXCLUDED.entry_count,
    course_count           = EXCLUDED.course_count,
    unmatched_course_count = EXCLUDED.unmatched_course_count,
    unmatched_course_codes = EXCLUDED.unmatched_course_codes;

  RETURN jsonb_build_object(
    'courses', course_total,
    'entries', entry_total,
    'retired', retired_total,
    'unmatched', unmatched_total,
    'status', computed_status,
    'schedule_replaced', v_schedule_ok,
    'enrollments_reconciled', v_enrollments_ok
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.sync_student_academics(UUID, TEXT, TEXT, JSONB, JSONB, BOOLEAN, BOOLEAN) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RESOURCES — doctor-published materials + unified view
-- ═══════════════════════════════════════════════════════════════════════════

-- Distinct from print_documents (committee-only, for printing). These are
-- published by doctors *to students* of a course.
CREATE TABLE public.course_materials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  description    TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 4000),
  kind           TEXT NOT NULL DEFAULT 'notes'
    CHECK (kind IN ('notes', 'slides', 'reading', 'correction', 'other')),
  storage_path   TEXT NOT NULL UNIQUE,
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes     BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_course_materials_updated_at
  BEFORE UPDATE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_course_materials_change
  AFTER INSERT OR UPDATE OR DELETE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE INDEX idx_course_materials_course ON public.course_materials(course_id, published_at DESC);

-- Courses the signed-in student is (or was) enrolled in.
CREATE OR REPLACE FUNCTION public.current_student_course_ids()
RETURNS SETOF UUID AS $$
  SELECT course_id
  FROM public.student_enrollments
  WHERE student_id = auth.uid()
    AND status IN ('enrolled', 'completed');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_material(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_materials material
    WHERE material.storage_path = p_storage_path
      AND (
        public.is_admin()
        OR material.doctor_id = auth.uid()
        OR (
          material.published_at IS NOT NULL
          AND public.is_verified_student()
          AND material.course_id IN (SELECT public.current_student_course_ids())
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- One row per resource attached to a course, whatever its kind. Backs the
-- student "My Courses" surface. Security is inherited from the base tables:
-- the view is not SECURITY DEFINER, so RLS still applies to each source.
CREATE OR REPLACE VIEW public.course_resources
WITH (security_invoker = true) AS
  SELECT
    exam.id                       AS resource_id,
    'exam'::TEXT                  AS resource_kind,
    exam.course_id,
    exam.course_title             AS title,
    exam.exam_type || ' · ' || exam.year AS subtitle,
    exam.track,
    exam.file_url                 AS storage_path,
    'previous-exams'::TEXT        AS bucket,
    exam.created_at
  FROM public.previous_exams exam

  UNION ALL

  SELECT
    material.id,
    'material',
    material.course_id,
    material.title,
    material.kind,
    NULL,
    material.storage_path,
    'course-materials',
    material.created_at
  FROM public.course_materials material
  WHERE material.published_at IS NOT NULL

  UNION ALL

  SELECT
    assignment.id,
    'assignment',
    assignment.course_id,
    assignment.title,
    COALESCE(to_char(assignment.due_at, 'YYYY-MM-DD'), 'No due date'),
    assignment.target_track,
    assignment.attachment_path,
    'assignment-attachments',
    assignment.created_at
  FROM public.assignments assignment
  WHERE assignment.published_at IS NOT NULL
    AND assignment.course_id IS NOT NULL;

COMMENT ON VIEW public.course_resources IS
  'Every resource attached to a course: exams, doctor materials, assignments. security_invoker keeps each source table''s RLS in force.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TELEMETRY
-- ═══════════════════════════════════════════════════════════════════════════

-- First-party analytics. Disclosed in docs/PRIVACY.md and in the site's
-- privacy policy page. Append-only for clients: no SELECT policy is granted to
-- authenticated users, so a signed-in user cannot read anyone's events —
-- including their own — through PostgREST.
CREATE TABLE public.telemetry_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anonymous_id TEXT NOT NULL DEFAULT '',
  session_id   TEXT NOT NULL DEFAULT '',
  event_name   TEXT NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 120),
  path         TEXT NOT NULL DEFAULT '',
  referrer     TEXT NOT NULL DEFAULT '',
  properties   JSONB NOT NULL DEFAULT '{}'::JSONB,
  user_agent   TEXT NOT NULL DEFAULT '',
  locale       TEXT NOT NULL DEFAULT '',
  timezone     TEXT NOT NULL DEFAULT '',
  viewport     TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_telemetry_created ON public.telemetry_events(created_at DESC);
CREATE INDEX idx_telemetry_user_created ON public.telemetry_events(user_id, created_at DESC);
CREATE INDEX idx_telemetry_event_created ON public.telemetry_events(event_name, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.owner_emails         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_sync_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events     ENABLE ROW LEVEL SECURITY;

-- owner_emails: readable by owners only, writable by nobody (service role only).
CREATE POLICY "owner_emails_select_owner"
  ON public.owner_emails FOR SELECT
  USING (public.is_owner());

-- Enrolments and schedule are read-only to their student; only the sync
-- function (service role, which bypasses RLS) writes them.
CREATE POLICY "enrollments_select_self_or_staff"
  ON public.student_enrollments FOR SELECT
  USING (
    student_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments
      WHERE assignments.course_id = student_enrollments.course_id
        AND assignments.doctor_id = auth.uid()
    )
  );

CREATE POLICY "schedule_select_self_or_admin"
  ON public.schedule_entries FOR SELECT
  USING (student_id = auth.uid() OR public.is_admin());

CREATE POLICY "sync_state_select_self_or_admin"
  ON public.academic_sync_state FOR SELECT
  USING (student_id = auth.uid() OR public.is_admin());

-- Materials: doctors manage their own; students see published materials for
-- courses they are enrolled in.
CREATE POLICY "materials_select_student_doctor_admin"
  ON public.course_materials FOR SELECT
  USING (
    doctor_id = auth.uid()
    OR public.is_admin()
    OR (
      published_at IS NOT NULL
      AND public.is_verified_student()
      AND course_id IN (SELECT public.current_student_course_ids())
    )
  );

CREATE POLICY "materials_insert_doctor"
  ON public.course_materials FOR INSERT
  WITH CHECK (doctor_id = auth.uid() AND public.is_doctor());

CREATE POLICY "materials_update_doctor"
  ON public.course_materials FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (doctor_id = auth.uid() OR public.is_admin());

CREATE POLICY "materials_delete_doctor"
  ON public.course_materials FOR DELETE
  USING (doctor_id = auth.uid() OR public.is_admin());

-- Telemetry: anyone may append, nobody but an owner may read.
-- WITH CHECK still pins user_id: a bare WITH CHECK (TRUE) would let any
-- authenticated caller attribute an event to someone else's user_id (identity
-- forgery in an owner-only-readable audit stream). Anonymous callers have no
-- auth.uid(), so they may only insert with user_id NULL or omitted.
CREATE POLICY "telemetry_insert_anyone"
  ON public.telemetry_events FOR INSERT
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "telemetry_select_owner"
  ON public.telemetry_events FOR SELECT
  USING (public.is_owner());

-- ═══════════════════════════════════════════════════════════════════════════
-- 5b. GRANTS
-- Every table above enabled RLS but none of them received a table-level GRANT
-- to anon/authenticated. RLS is a *second* gate — Postgres checks the base
-- table privilege first, so without these grants every policy above is
-- unreachable and PostgREST returns "permission denied for table ..." on all
-- of them, for every role including the owner. Grants are intentionally
-- broader than the "self/staff only" read comments above: RLS (not the grant)
-- is what stops a non-owner authenticated user from writing to, say,
-- student_enrollments — there is no INSERT/UPDATE/DELETE policy for anyone
-- but the owner, so the grant alone cannot widen access.
-- ═══════════════════════════════════════════════════════════════════════════

-- Owner allowlist: readable only by the owner (via RLS); never writable
-- through the API, not even by the owner — see comment on the table.
GRANT SELECT ON public.owner_emails TO authenticated;

-- Academics: read-only surface for students/doctors/admin; written only by
-- the service-role sync function (which bypasses grants entirely), except
-- for the owner's break-glass access via the owner_full_access_* policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_sync_state TO authenticated;

-- Course materials: doctors manage their own, students/admin read.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_materials TO authenticated;

-- Telemetry: anyone (including anonymous visitors) may append; only the
-- owner's SELECT policy can ever read a row back.
GRANT INSERT ON public.telemetry_events TO anon, authenticated;
GRANT SELECT ON public.telemetry_events TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. STORAGE
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-materials', 'course-materials', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "course_materials_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-materials' AND public.can_read_material(name));

CREATE POLICY "course_materials_write_doctor"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-materials'
    AND public.is_doctor()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. OWNER FULL ACCESS — applied last so it covers every table above
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  target TEXT;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'profiles', 'admin_emails', 'courses', 'previous_exams', 'entrance_exams',
    'events', 'event_registrations', 'favorites', 'print_documents', 'assignments',
    'assignment_submissions', 'student_enrollments', 'schedule_entries',
    'academic_sync_state', 'course_materials', 'telemetry_events'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = target) THEN
      PERFORM public.grant_owner_full_access(target);
    END IF;
  END LOOP;
END $$;

-- audit_logs is deliberately excluded from grant_owner_full_access: the owner
-- may read the trail but must never be able to edit or delete it.
CREATE POLICY "audit_logs_select_owner_or_admin"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin());
