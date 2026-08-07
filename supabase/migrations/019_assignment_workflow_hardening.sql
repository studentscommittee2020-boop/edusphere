-- EduSphere v2 — migration 019
--
-- Assignment workflow hardening after the ordered 009–018 batch.
--
-- 015_assignment_visibility.sql is currently an untracked local migration.
-- This migration intentionally re-states its durable course/enrolment
-- visibility rules, so the final schema is correct whether 015 is present in
-- an ordered fresh apply or was omitted from an earlier local review. Existing
-- course_id NULL rows remain readable as legacy rows; new rows cannot be
-- created without a course.
--
-- No university file number, raw university response, email OTP, or other
-- identity-verification data is introduced or written by this migration.

-- RLS does not constrain SECURITY DEFINER functions owned by the table owner.
-- Every user-facing SECURITY DEFINER function below calls this guard before
-- reading or writing protected portal data.
CREATE OR REPLACE FUNCTION public.require_portal_mfa()
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() ->> 'aal') IS DISTINCT FROM 'aal2' THEN
    RAISE EXCEPTION 'Authenticator MFA is required for portal data';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.require_portal_mfa() FROM PUBLIC, anon, authenticated;

-- Reconciles migration 015's course/enrolment model. The parameterised helper
-- is used by RPCs; the current-user helper continues to back the SELECT RLS
-- policy. Both preserve legacy NULL-course rows and submission continuity.
CREATE OR REPLACE FUNCTION public.assignment_visible_to_current_student(p_assignment_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    JOIN public.profiles student ON student.id = auth.uid()
    WHERE assignment.id = p_assignment_id
      AND assignment.published_at IS NOT NULL
      AND public.is_verified_student()
      AND (
        (
          assignment.course_id IS NOT NULL
          AND assignment.course_id IN (SELECT public.current_student_course_ids())
          AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
          AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
          AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
        )
        OR (
          -- Legacy assignments created before course scoping remain readable.
          assignment.course_id IS NULL
          AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
          AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
          AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
        )
        OR EXISTS (
          SELECT 1
          FROM public.assignment_submissions submission
          WHERE submission.assignment_id = assignment.id
            AND submission.student_id = auth.uid()
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.assignment_visible_to_current_student(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assignment_visible_to_current_student(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.assignment_visible_to_student(
  p_assignment_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    JOIN public.profiles student ON student.id = p_student_id
    WHERE assignment.id = p_assignment_id
      AND assignment.published_at IS NOT NULL
      AND public.is_target_role(p_student_id, 'student')
      AND (
        (
          assignment.course_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.student_enrollments enrollment
            WHERE enrollment.student_id = p_student_id
              AND enrollment.course_id = assignment.course_id
              AND enrollment.status IN ('enrolled', 'completed')
          )
          AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
          AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
          AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
        )
        OR (
          -- Legacy assignments created before course scoping remain readable.
          assignment.course_id IS NULL
          AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
          AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
          AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
        )
        OR EXISTS (
          SELECT 1
          FROM public.assignment_submissions submission
          WHERE submission.assignment_id = assignment.id
            AND submission.student_id = p_student_id
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.assignment_visible_to_student(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Preserve old rows while preventing the database from accepting any newly
-- unscoped assignment, including through privileged application clients.
CREATE OR REPLACE FUNCTION public.enforce_assignment_course_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'New assignments must be attached to a course';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.course_id IS NOT NULL AND NEW.course_id IS NULL THEN
    RAISE EXCEPTION 'A course-backed assignment cannot be detached from its course';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.enforce_assignment_course_scope() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_assignment_course_scope ON public.assignments;
CREATE TRIGGER enforce_assignment_course_scope
  BEFORE INSERT OR UPDATE OF course_id ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_course_scope();

DROP POLICY IF EXISTS "assignments_insert_doctor" ON public.assignments;
CREATE POLICY "assignments_insert_doctor"
  ON public.assignments FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id = (SELECT auth.uid())
    AND public.is_doctor()
    AND course_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.doctor_courses doctor_course
      WHERE doctor_course.doctor_id = (SELECT auth.uid())
        AND doctor_course.course_id = assignments.course_id
        AND doctor_course.is_active
    )
  );

DROP POLICY IF EXISTS "assignments_update_doctor" ON public.assignments;
CREATE POLICY "assignments_update_doctor"
  ON public.assignments FOR UPDATE TO authenticated
  USING (doctor_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (
    public.is_admin()
    OR (
      doctor_id = (SELECT auth.uid())
      AND course_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.doctor_courses doctor_course
        WHERE doctor_course.doctor_id = (SELECT auth.uid())
          AND doctor_course.course_id = assignments.course_id
          AND doctor_course.is_active
      )
    )
  );

-- Print status is operational state, not an arbitrary client-editable field.
-- Keep the documented owner escape hatch from 009, while routing committee
-- transitions through a single MFA-gated state machine.
DROP POLICY IF EXISTS "print_documents_update_doctor_requested" ON public.print_documents;
DROP POLICY IF EXISTS "print_documents_update_committee" ON public.print_documents;

CREATE OR REPLACE FUNCTION public.transition_print_document(
  p_document_id UUID,
  p_status TEXT
)
RETURNS public.print_documents AS $$
DECLARE
  document_record public.print_documents;
  transitioned_document public.print_documents;
BEGIN
  PERFORM public.require_portal_mfa();

  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only the student committee or an administrator may transition a print job';
  END IF;

  SELECT * INTO document_record
  FROM public.print_documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF document_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown print document';
  END IF;

  IF NOT COALESCE((
    (document_record.status = 'requested' AND p_status IN ('printing', 'cancelled'))
    OR (document_record.status = 'printing' AND p_status IN ('ready', 'cancelled'))
    OR (document_record.status = 'ready' AND p_status = 'completed')
  ), FALSE) THEN
    RAISE EXCEPTION 'Invalid print-job status transition from % to %', document_record.status, p_status;
  END IF;

  UPDATE public.print_documents
  SET status = p_status
  WHERE id = document_record.id
  RETURNING * INTO transitioned_document;

  RETURN transitioned_document;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.transition_print_document(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_print_document(UUID, TEXT) TO authenticated;

-- Submission creation remains submit_assignment() only. Add MFA protection
-- here as restrictive RLS does not apply while a SECURITY DEFINER RPC runs.
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
  PERFORM public.require_portal_mfa();

  IF NOT public.is_verified_student() OR NOT public.is_target_role(v_actor_id, 'student') THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  SELECT * INTO assignment_record
  FROM public.assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF assignment_record.id IS NULL
    OR NOT public.assignment_visible_to_student(p_assignment_id, v_actor_id) THEN
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

  IF p_storage_path NOT LIKE auth.uid()::TEXT || '/' || p_assignment_id::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid submission storage path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'assignment-submissions' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  SELECT COUNT(*) + 1 INTO next_attempt
  FROM public.assignment_submissions
  WHERE assignment_id = p_assignment_id AND student_id = v_actor_id;

  IF next_attempt > assignment_record.max_submissions THEN
    RAISE EXCEPTION 'Maximum submission count reached';
  END IF;

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

REVOKE ALL ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;

-- No authenticated RLS policy remains for direct submission updates. The
-- owner full-access policy from 009 is deliberately retained as the documented
-- owner escape hatch; doctors and admins must use the constrained RPC below.
DROP POLICY IF EXISTS "submissions_update_doctor_or_admin" ON public.assignment_submissions;

CREATE OR REPLACE FUNCTION public.review_assignment_submission(
  p_submission_id UUID,
  p_status TEXT,
  p_grade NUMERIC DEFAULT NULL,
  p_feedback TEXT DEFAULT ''
)
RETURNS public.assignment_submissions AS $$
DECLARE
  submission_record public.assignment_submissions;
  assignment_record public.assignments;
  reviewed_submission public.assignment_submissions;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  PERFORM public.require_portal_mfa();

  SELECT * INTO submission_record
  FROM public.assignment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF submission_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown assignment submission';
  END IF;

  SELECT * INTO assignment_record
  FROM public.assignments
  WHERE id = submission_record.assignment_id;

  IF NOT (public.is_admin() OR assignment_record.doctor_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the assignment doctor or an administrator may review this submission';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('returned', 'graded') THEN
    RAISE EXCEPTION 'Review status must be returned or graded';
  END IF;

  IF p_status = 'graded' AND (p_grade IS NULL OR p_grade < 0 OR p_grade > 100) THEN
    RAISE EXCEPTION 'A grade between 0 and 100 is required when grading';
  END IF;

  IF p_status = 'returned' AND p_grade IS NOT NULL THEN
    RAISE EXCEPTION 'Returned submissions cannot have a grade';
  END IF;

  IF char_length(COALESCE(p_feedback, '')) > 4000 THEN
    RAISE EXCEPTION 'Feedback must not exceed 4000 characters';
  END IF;

  UPDATE public.assignment_submissions
  SET status = p_status,
      grade = CASE WHEN p_status = 'graded' THEN p_grade ELSE NULL END,
      feedback = COALESCE(p_feedback, ''),
      reviewed_at = NOW(),
      reviewed_by = v_actor_id
  WHERE id = submission_record.id
  RETURNING * INTO reviewed_submission;

  RETURN reviewed_submission;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.review_assignment_submission(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_assignment_submission(UUID, TEXT, NUMERIC, TEXT) TO authenticated;

-- One RLS-safe read avoids the client stitching assignments and submissions
-- across separate queries. It deliberately exposes only the caller's own
-- submissions to students, all submissions to the assignment's doctor, and
-- all rows to real administrators. Actor selection is attribution/display
-- only; permission checks continue to use the real JWT identity.
CREATE OR REPLACE FUNCTION public.get_assignment_portal_feed()
RETURNS TABLE (
  assignment_id UUID,
  doctor_id UUID,
  course_id UUID,
  title TEXT,
  description TEXT,
  target_major TEXT,
  target_semester TEXT,
  target_track TEXT,
  due_at TIMESTAMPTZ,
  allow_late BOOLEAN,
  max_submissions INTEGER,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime_type TEXT,
  attachment_size_bytes BIGINT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  submissions JSONB
) AS $$
DECLARE
  v_subject_id UUID := public.effective_user_id();
BEGIN
  PERFORM public.require_portal_mfa();

  IF public.is_admin() THEN
    RETURN QUERY
    SELECT a.id, a.doctor_id, a.course_id, a.title, a.description,
      a.target_major, a.target_semester, a.target_track, a.due_at,
      a.allow_late, a.max_submissions, a.attachment_path, a.attachment_name,
      a.attachment_mime_type, a.attachment_size_bytes, a.published_at,
      a.created_at, a.updated_at,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(submission) ORDER BY submission.submitted_at DESC)
        FROM public.assignment_submissions submission
        WHERE submission.assignment_id = a.id
      ), '[]'::JSONB)
    FROM public.assignments a
    ORDER BY a.due_at ASC NULLS LAST, a.created_at DESC;
    RETURN;
  END IF;

  IF public.is_doctor() AND public.is_target_role(v_subject_id, 'doctor') THEN
    RETURN QUERY
    SELECT a.id, a.doctor_id, a.course_id, a.title, a.description,
      a.target_major, a.target_semester, a.target_track, a.due_at,
      a.allow_late, a.max_submissions, a.attachment_path, a.attachment_name,
      a.attachment_mime_type, a.attachment_size_bytes, a.published_at,
      a.created_at, a.updated_at,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(submission) ORDER BY submission.submitted_at DESC)
        FROM public.assignment_submissions submission
        WHERE submission.assignment_id = a.id
      ), '[]'::JSONB)
    FROM public.assignments a
    WHERE a.doctor_id = v_subject_id
    ORDER BY a.due_at ASC NULLS LAST, a.created_at DESC;
    RETURN;
  END IF;

  IF public.is_verified_student() AND public.is_target_role(v_subject_id, 'student') THEN
    RETURN QUERY
    SELECT a.id, a.doctor_id, a.course_id, a.title, a.description,
      a.target_major, a.target_semester, a.target_track, a.due_at,
      a.allow_late, a.max_submissions, a.attachment_path, a.attachment_name,
      a.attachment_mime_type, a.attachment_size_bytes, a.published_at,
      a.created_at, a.updated_at,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(submission) ORDER BY submission.submitted_at DESC)
        FROM public.assignment_submissions submission
        WHERE submission.assignment_id = a.id
          AND submission.student_id = v_subject_id
      ), '[]'::JSONB)
    FROM public.assignments a
    WHERE public.assignment_visible_to_student(a.id, v_subject_id)
    ORDER BY a.due_at ASC NULLS LAST, a.created_at DESC;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Assignment portal access is not available for this account';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.get_assignment_portal_feed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_assignment_portal_feed() TO authenticated;

-- Storage signed URLs can bypass a later object SELECT, so audit the
-- authorization lookup itself. Replacing every protected storage SELECT policy
-- with this gate makes normal browser downloads append an immutable audit row.
CREATE OR REPLACE FUNCTION public.authorize_and_log_portal_file_access(
  p_bucket_id TEXT,
  p_storage_path TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_entity_id UUID;
  v_entity_type TEXT;
  v_impersonation public.impersonation_sessions;
  v_metadata JSONB := jsonb_build_object('storage_path', p_storage_path);
BEGIN
  PERFORM public.require_portal_mfa();

  IF p_bucket_id = 'exam-papers' THEN
    IF NOT public.is_verified_student() THEN
      RETURN FALSE;
    END IF;

    SELECT id INTO v_entity_id
    FROM public.previous_exams
    WHERE file_url = p_storage_path;
    v_entity_type := 'session_file';
  ELSIF p_bucket_id = 'print-documents' THEN
    IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
      RETURN FALSE;
    END IF;

    SELECT id INTO v_entity_id
    FROM public.print_documents
    WHERE storage_path = p_storage_path;
    v_entity_type := 'print_document_file';
  ELSIF p_bucket_id = 'assignment-attachments' THEN
    SELECT assignment.id INTO v_entity_id
    FROM public.assignments assignment
    WHERE assignment.attachment_path = p_storage_path
      AND (
        public.is_admin()
        OR assignment.doctor_id = auth.uid()
        OR (
          public.is_target_role(auth.uid(), 'student')
          AND public.assignment_visible_to_current_student(assignment.id)
        )
      );
    v_entity_type := 'assignment_attachment';
  ELSIF p_bucket_id = 'assignment-submissions' THEN
    SELECT submission.id INTO v_entity_id
    FROM public.assignment_submissions submission
    JOIN public.assignments assignment ON assignment.id = submission.assignment_id
    WHERE submission.storage_path = p_storage_path
      AND (
        public.is_admin()
        OR submission.student_id = auth.uid()
        OR assignment.doctor_id = auth.uid()
      );
    v_entity_type := 'assignment_submission_file';
  ELSE
    RETURN FALSE;
  END IF;

  IF v_entity_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_impersonation
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid()
    AND ended_at IS NULL
    AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_impersonation.id IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object(
      'impersonated_by', jsonb_build_object(
        'owner_id', v_impersonation.owner_id,
        'target_user_id', v_impersonation.target_user_id,
        'session_id', v_impersonation.id
      )
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'opened', v_entity_type, v_entity_id, v_metadata);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.authorize_and_log_portal_file_access(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_and_log_portal_file_access(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_session_file_access(p_storage_path TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.authorize_and_log_portal_file_access('exam-papers', p_storage_path) THEN
    RAISE EXCEPTION 'Unknown or unauthorized session file';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.log_session_file_access(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_session_file_access(TEXT) TO authenticated;

DROP POLICY IF EXISTS "session_files_verified_read" ON storage.objects;
CREATE POLICY "session_files_logged_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'exam-papers'
    AND public.authorize_and_log_portal_file_access(bucket_id, name)
  );

DROP POLICY IF EXISTS "print_documents_committee_read" ON storage.objects;
CREATE POLICY "print_documents_logged_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'print-documents'
    AND public.authorize_and_log_portal_file_access(bucket_id, name)
  );

DROP POLICY IF EXISTS "assignment_attachments_authorized_read" ON storage.objects;
CREATE POLICY "assignment_attachments_logged_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-attachments'
    AND public.authorize_and_log_portal_file_access(bucket_id, name)
  );

DROP POLICY IF EXISTS "assignment_submissions_authorized_read" ON storage.objects;
CREATE POLICY "assignment_submissions_logged_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-submissions'
    AND public.authorize_and_log_portal_file_access(bucket_id, name)
  );
