-- EduSphere v2 — migration 011
--
-- Adds:
--   1. Exam reporting — students flag a problem or rate the quality of a
--      previous_exams file. Reports are triaged by the student committee
--      (is_committee_admin()), not by doctors — this is an archive-curation
--      workflow, unrelated to course teaching.
--   2. Mass-download prevention — 008 gave every verified portal user a
--      standing SELECT on the whole exam-papers bucket. That is exactly what
--      a scraper needs (read previous_exams.file_url for every row, mint a
--      signed URL for each, no rate limit anywhere in the path). This
--      replaces the student-reachable policy with a quota-checked RPC.
--
-- Runs after 009 and 010: previous_exams, profiles, is_verified_student(),
-- is_admin(), is_committee_admin(), handle_updated_at() and
-- grant_owner_full_access() already exist. Nothing here redefines them.
--
-- Conventions follow 009: SECURITY DEFINER + STABLE + `SET search_path` on
-- predicate helpers, REVOKE-then-GRANT on any function that must not be
-- callable by anon, and grant_owner_full_access() applied to both new mutable
-- tables so the owner's access and audit trail cover them too.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXAM REPORTS — table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.exam_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_exam_id UUID NOT NULL REFERENCES public.previous_exams(id) ON DELETE CASCADE,
  reporter_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('problem', 'quality')),
  problem_type     TEXT CHECK (problem_type IS NULL OR problem_type IN (
                     'unreadable', 'wrong_course', 'wrong_year', 'wrong_track',
                     'missing_pages', 'duplicate', 'corrupt_file', 'other'
                   )),
  quality_rating   SMALLINT CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5),
  message          TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  status           TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A student can file one problem report AND one quality rating per exam,
  -- but not two of the same kind — submit_exam_report()'s ON CONFLICT DO
  -- UPDATE (below) is what makes re-reporting an edit instead of a 23505.
  UNIQUE (previous_exam_id, reporter_id, kind),
  -- The requiredness/exclusivity of problem_type vs. quality_rating is a
  -- cross-column rule, which a per-column CHECK cannot express — it has to be
  -- a table-level constraint, and it must live in the database (not app code)
  -- because submit_exam_report() and any future direct-SQL access both have
  -- to go through it.
  CONSTRAINT exam_reports_kind_consistency_check CHECK (
    (kind = 'problem' AND problem_type IS NOT NULL AND quality_rating IS NULL)
    OR
    (kind = 'quality' AND quality_rating IS NOT NULL AND problem_type IS NULL)
  )
);

COMMENT ON TABLE public.exam_reports IS
  'Student-filed problem reports and quality ratings on previous_exams files, triaged by the student committee.';

CREATE TRIGGER set_exam_reports_updated_at
  BEFORE UPDATE ON public.exam_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Status changes (open -> reviewing -> resolved/dismissed) are exactly the
-- kind of moderation action 008 already audits for print_documents/
-- assignments; exam_reports gets the same trail.
CREATE TRIGGER audit_exam_reports_change
  AFTER INSERT OR UPDATE OR DELETE ON public.exam_reports
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE INDEX idx_exam_reports_status_created ON public.exam_reports(status, created_at DESC);
CREATE INDEX idx_exam_reports_previous_exam ON public.exam_reports(previous_exam_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXAM REPORTS — review-field guard + submit RPC
-- ═══════════════════════════════════════════════════════════════════════════

-- Committee/admin may triage (status, resolved_by, resolved_at); the report's
-- content is the student's own account of the problem and is not theirs to
-- rewrite. This can't be expressed as a column-level GRANT because committee,
-- admin and the owner all authenticate as the same Postgres 'authenticated'
-- role — a column privilege can't tell them apart, only a row-aware check
-- can. Mirrors 004's prevent_role_update trigger shape.
CREATE OR REPLACE FUNCTION public.restrict_exam_report_review_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- The report's own author (via submit_exam_report's ON CONFLICT DO UPDATE)
  -- may freely edit their own content, and the owner is unconditionally
  -- exempt. Anyone else touching this row is a reviewer acting on someone
  -- else's report — restrict them to the triage fields.
  IF NEW.reporter_id IS DISTINCT FROM auth.uid() AND NOT public.is_owner() THEN
    IF NEW.kind             IS DISTINCT FROM OLD.kind
      OR NEW.problem_type    IS DISTINCT FROM OLD.problem_type
      OR NEW.quality_rating  IS DISTINCT FROM OLD.quality_rating
      OR NEW.message         IS DISTINCT FROM OLD.message
      OR NEW.reporter_id     IS DISTINCT FROM OLD.reporter_id
      OR NEW.previous_exam_id IS DISTINCT FROM OLD.previous_exam_id
    THEN
      RAISE EXCEPTION 'Reviewers may only update status, resolved_by and resolved_at';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER restrict_exam_report_review_fields_trigger
  BEFORE UPDATE ON public.exam_reports
  FOR EACH ROW EXECUTE FUNCTION public.restrict_exam_report_review_fields();

-- The only write path for a student: validates verified-student access, then
-- inserts or — on a re-report — updates their own existing row. There is
-- deliberately no direct INSERT policy/grant on exam_reports (see GRANTS):
-- this function is SECURITY DEFINER and does not need one, exactly like
-- 008's submit_assignment()/assignment_submissions.
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.previous_exams WHERE id = p_previous_exam_id) THEN
    RAISE EXCEPTION 'Unknown exam';
  END IF;

  IF p_kind NOT IN ('problem', 'quality') THEN
    RAISE EXCEPTION 'kind must be problem or quality';
  END IF;

  INSERT INTO public.exam_reports (
    previous_exam_id, reporter_id, kind, problem_type, quality_rating, message, status
  ) VALUES (
    p_previous_exam_id, auth.uid(), p_kind, p_problem_type, p_quality_rating,
    COALESCE(p_message, ''), 'open'
  )
  ON CONFLICT (previous_exam_id, reporter_id, kind)
  DO UPDATE SET
    problem_type   = EXCLUDED.problem_type,
    quality_rating = EXCLUDED.quality_rating,
    message        = EXCLUDED.message,
    -- New information from the student reopens a report that was already
    -- resolved/dismissed rather than leaving it silently stale.
    status         = 'open',
    resolved_by    = NULL,
    resolved_at    = NULL
  RETURNING * INTO v_report;

  RETURN v_report;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.submit_exam_report(UUID, TEXT, TEXT, SMALLINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_exam_report(UUID, TEXT, TEXT, SMALLINT, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. EXAM QUALITY SUMMARY — anonymous aggregate
-- ═══════════════════════════════════════════════════════════════════════════
-- Deliberately NOT security_invoker (unlike 009's course_resources): the
-- point of this view is a cross-student aggregate — average rating and
-- report counts for an exam — and a student's own RLS on exam_reports only
-- ever exposes their own row (reporter_id = auth.uid()). Under
-- security_invoker=true the view would just echo each caller's single row
-- back at them, not an aggregate, which defeats "show file quality without
-- exposing who reported what". So this runs as the view owner (like a
-- SECURITY DEFINER function would), reading every row, but only ever
-- SELECTs aggregated columns — reporter_id and message never appear here —
-- and the `is_verified_student()` predicate in the WHERE clause still gates
-- who gets a result at all (it's STABLE and reads the caller's own JWT, so it
-- evaluates per-caller even though the view itself is not per-row RLS'd).
CREATE OR REPLACE VIEW public.exam_quality_summary AS
  SELECT
    previous_exam_id,
    ROUND(AVG(quality_rating) FILTER (WHERE kind = 'quality'), 2) AS avg_rating,
    COUNT(*) FILTER (WHERE kind = 'quality')                      AS quality_report_count,
    COUNT(*) FILTER (WHERE kind = 'problem')                      AS problem_report_count
  FROM public.exam_reports
  WHERE public.is_verified_student()
  GROUP BY previous_exam_id;

COMMENT ON VIEW public.exam_quality_summary IS
  'Per-exam average rating and report counts. Aggregated only — never exposes reporter identity or report content. Readable by any verified portal user.';

GRANT SELECT ON public.exam_quality_summary TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. MASS-DOWNLOAD PREVENTION — close the self-service bucket read
-- ═══════════════════════════════════════════════════════════════════════════
-- is_verified_student() is TRUE for every plain student, so 008's policy was
-- effectively "any signed-in verified student may read any object in
-- exam-papers" — no rate limit anywhere in that path. A script that lists
-- previous_exams.file_url and requests each object in a loop is
-- indistinguishable, at the storage layer, from a student opening one file.
-- Replace it with a staff-only policy; every other caller now has to go
-- through request_exam_download() below, which is the only place a quota is
-- enforced. (Doctors are not carried over here or into the quota bypass list
-- in request_exam_download() — their surface is course_materials/
-- assignments, not the previous_exams archive, and they were never called
-- out as needing unlimited exam-paper access. If that turns out to be wrong,
-- add is_doctor() to both places.)
DROP POLICY IF EXISTS "session_files_verified_read" ON storage.objects;

CREATE POLICY "session_files_staff_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-papers' AND (public.is_admin() OR public.is_committee_admin()));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. MASS-DOWNLOAD PREVENTION — quota-checked download RPC
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE public.exam_download_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_exam_id UUID NOT NULL REFERENCES public.previous_exams(id) ON DELETE CASCADE,
  storage_path     TEXT NOT NULL,
  ip_hash          TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.exam_download_events IS
  'Append-only download-quota ledger written exclusively by request_exam_download(). Never exposed for direct INSERT/UPDATE/DELETE, not even to the owner — see GRANTS.';

CREATE INDEX idx_exam_download_events_user_created ON public.exam_download_events(user_id, created_at DESC);

-- The only entry point for a signed download URL. Called with the caller's
-- own JWT (never the service role — see supabase/functions/exam-download),
-- so auth.uid() is the real identity the quota is keyed to.
CREATE OR REPLACE FUNCTION public.request_exam_download(p_exam_id UUID)
RETURNS JSONB AS $$
DECLARE
  -- Tunable knobs, named and gathered here on purpose: generous enough that a
  -- student cramming before finals never notices them, tight enough that a
  -- script mirroring the whole bucket hits a wall in well under a minute.
  -- Nothing reads these from config — change the numbers, ship a migration.
  HOURLY_LIMIT         CONSTANT INTEGER := 20;  -- downloads per rolling 1 hour
  DAILY_LIMIT          CONSTANT INTEGER := 60;  -- downloads per rolling 24 hours
  BURST_DISTINCT_LIMIT CONSTANT INTEGER := 5;   -- distinct exams allowed inside the burst window
  BURST_WINDOW_SECONDS CONSTANT INTEGER := 60;  -- width of the burst window

  v_uid            UUID := auth.uid();
  v_privileged     BOOLEAN;
  v_storage_path   TEXT;
  v_now            TIMESTAMPTZ := NOW();
  v_hour_count     INTEGER;
  v_hour_oldest    TIMESTAMPTZ;
  v_day_count      INTEGER;
  v_day_oldest     TIMESTAMPTZ;
  v_burst_distinct INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  -- Covers both "no such exam" and "exam exists but has no file uploaded
  -- yet" (previous_exams.file_url is nullable) — either way there is nothing
  -- to sign, so the caller gets the same not_found reason.
  SELECT file_url INTO v_storage_path
  FROM public.previous_exams
  WHERE id = p_exam_id;

  IF v_storage_path IS NULL THEN
    RETURN jsonb_build_object('allowed', FALSE, 'reason', 'not_found', 'retry_after_seconds', 0);
  END IF;

  -- Staff bypass the quota entirely but still leave a trail (the INSERT
  -- below runs unconditionally) — the limits exist to stop a scraper, not to
  -- slow down the committee doing its job.
  v_privileged := public.is_admin() OR public.is_committee_admin();

  IF NOT v_privileged THEN
    -- One aggregate scan — indexed on (user_id, created_at) — covers the
    -- hour window, the day window, and the burst window in a single pass
    -- instead of three separate round trips.
    SELECT
      COUNT(*)        FILTER (WHERE created_at > v_now - INTERVAL '1 hour'),
      MIN(created_at) FILTER (WHERE created_at > v_now - INTERVAL '1 hour'),
      COUNT(*)        FILTER (WHERE created_at > v_now - INTERVAL '24 hours'),
      MIN(created_at) FILTER (WHERE created_at > v_now - INTERVAL '24 hours'),
      COUNT(DISTINCT previous_exam_id) FILTER (
        WHERE created_at > v_now - make_interval(secs => BURST_WINDOW_SECONDS)
          AND previous_exam_id <> p_exam_id
      )
    INTO v_hour_count, v_hour_oldest, v_day_count, v_day_oldest, v_burst_distinct
    FROM public.exam_download_events
    WHERE user_id = v_uid
      AND created_at > v_now - INTERVAL '24 hours';

    v_hour_count     := COALESCE(v_hour_count, 0);
    v_day_count      := COALESCE(v_day_count, 0);
    v_burst_distinct := COALESCE(v_burst_distinct, 0);

    -- Re-downloading the *same* exam repeatedly within the burst window isn't
    -- a scraping signature (excluded via `previous_exam_id <> p_exam_id`
    -- above) — it's a scraper hitting a wide spread of *different* exams
    -- fast that this catches.
    IF v_burst_distinct >= BURST_DISTINCT_LIMIT THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'burst_limit', 'retry_after_seconds', BURST_WINDOW_SECONDS
      );
    ELSIF v_hour_count >= HOURLY_LIMIT THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'hourly_limit',
        'retry_after_seconds',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_hour_oldest + INTERVAL '1 hour' - v_now))))::INTEGER
      );
    ELSIF v_day_count >= DAILY_LIMIT THEN
      RETURN jsonb_build_object(
        'allowed', FALSE, 'reason', 'daily_limit',
        'retry_after_seconds',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_day_oldest + INTERVAL '24 hours' - v_now))))::INTEGER
      );
    END IF;
  END IF;

  -- Only ever reached on allow — a denied request leaves no row.
  INSERT INTO public.exam_download_events (user_id, previous_exam_id, storage_path)
  VALUES (v_uid, p_exam_id, v_storage_path);

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'storage_path', v_storage_path,
    'remaining_hour',
      CASE WHEN v_privileged THEN HOURLY_LIMIT ELSE GREATEST(HOURLY_LIMIT - v_hour_count - 1, 0) END,
    'remaining_day',
      CASE WHEN v_privileged THEN DAILY_LIMIT ELSE GREATEST(DAILY_LIMIT - v_day_count - 1, 0) END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.request_exam_download(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_exam_download(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.exam_reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_download_events ENABLE ROW LEVEL SECURITY;

-- exam_reports: no INSERT policy — submit_exam_report() (SECURITY DEFINER)
-- is the only write path for a report's own author, exactly like 008's
-- submit_assignment()/assignment_submissions.
CREATE POLICY "exam_reports_select_own"
  ON public.exam_reports FOR SELECT
  USING (reporter_id = auth.uid());

CREATE POLICY "exam_reports_select_committee_or_admin"
  ON public.exam_reports FOR SELECT
  USING (public.is_committee_admin() OR public.is_admin());

-- WHO may attempt an UPDATE is gated here; WHAT they may change is gated by
-- restrict_exam_report_review_fields_trigger above.
CREATE POLICY "exam_reports_update_committee_or_admin"
  ON public.exam_reports FOR UPDATE
  USING (public.is_committee_admin() OR public.is_admin())
  WITH CHECK (public.is_committee_admin() OR public.is_admin());

-- No DELETE policy here on purpose: the only DELETE policy exam_reports gets
-- is owner_full_access_exam_reports, attached in section 8 below, so "only
-- the owner may delete" falls out of RLS's default-deny for free.

-- exam_download_events: no policy for students/committee/admin at all. Rows
-- are written only by request_exam_download() (SECURITY DEFINER — does not
-- need a table grant to INSERT) and read only by the owner, via
-- owner_full_access_exam_download_events in section 8. The table GRANT below
-- additionally caps even the owner's reachable privilege at SELECT — see the
-- comment there for why.

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. GRANTS
-- ═══════════════════════════════════════════════════════════════════════════

-- Full CRUD ceiling so the owner's FOR ALL policy (section 8) is actually
-- reachable — RLS above is what stops everyone else from doing anything but
-- SELECT-own / SELECT-all / UPDATE-triage-fields; the GRANT is deliberately
-- wider than any single non-owner role needs, same discipline 009 required
-- once its table GRANTs turned out to be missing entirely.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_reports TO authenticated;

-- SELECT only, for everyone including the owner: this is a write-once quota
-- ledger. Even the owner's FOR ALL RLS policy on this table (section 8)
-- cannot exceed what the GRANT allows, so INSERT/UPDATE/DELETE stay
-- unreachable through the API for anyone — the same reasoning 009 applied to
-- excluding audit_logs from grant_owner_full_access entirely, applied here
-- via the grant ceiling instead since request_exam_download() still needs
-- the RLS+trigger machinery grant_owner_full_access wires up for the other
-- 15 tables it covers.
GRANT SELECT ON public.exam_download_events TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. OWNER FULL ACCESS — applied last so it covers both tables above
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM public.grant_owner_full_access('exam_reports');
  PERFORM public.grant_owner_full_access('exam_download_events');
END $$;
