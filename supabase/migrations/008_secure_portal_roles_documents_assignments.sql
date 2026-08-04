-- EduSphere secure portal: verified students, doctor workflows, assignments,
-- private storage, and an immutable operational audit trail.

-- The University verification service sets this immutable claim through the
-- service-role Edge Function after checking the student record. File numbers
-- and university responses are never written to this database.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'doctor', 'committee_admin', 'admin'));

CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = p_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS BOOLEAN AS $$
  SELECT public.has_role('doctor');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_committee_admin()
RETURNS BOOLEAN AS $$
  SELECT public.has_role('committee_admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_verified_student()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.is_admin()
    OR public.is_doctor()
    OR public.is_committee_admin()
    OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'student_verified')::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE TABLE public.print_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  copies INTEGER NOT NULL DEFAULT 1 CHECK (copies BETWEEN 1 AND 500),
  page_count INTEGER CHECK (page_count BETWEEN 1 AND 2000),
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'printing', 'ready', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_print_documents_updated_at
  BEFORE UPDATE ON public.print_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_print_documents_doctor_created ON public.print_documents(doctor_id, created_at DESC);
CREATE INDEX idx_print_documents_status_created ON public.print_documents(status, created_at DESC);

CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 12000),
  target_major TEXT,
  target_semester TEXT,
  target_track TEXT CHECK (target_track IS NULL OR target_track IN ('french', 'english')),
  due_at TIMESTAMPTZ,
  allow_late BOOLEAN NOT NULL DEFAULT FALSE,
  max_submissions INTEGER NOT NULL DEFAULT 1 CHECK (max_submissions BETWEEN 1 AND 10),
  attachment_path TEXT UNIQUE,
  attachment_name TEXT,
  attachment_mime_type TEXT CHECK (attachment_mime_type IS NULL OR attachment_mime_type = 'application/pdf'),
  attachment_size_bytes BIGINT CHECK (attachment_size_bytes IS NULL OR (attachment_size_bytes > 0 AND attachment_size_bytes <= 26214400)),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_assignments_doctor_created ON public.assignments(doctor_id, created_at DESC);
CREATE INDEX idx_assignments_published_due ON public.assignments(published_at, due_at);
CREATE INDEX idx_assignments_target ON public.assignments(target_major, target_semester, target_track);

CREATE TABLE public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number BETWEEN 1 AND 10),
  storage_path TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'application/pdf'),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  message TEXT NOT NULL DEFAULT '' CHECK (char_length(message) <= 2000),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'late', 'returned', 'graded')),
  grade NUMERIC(5,2) CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100)),
  feedback TEXT NOT NULL DEFAULT '' CHECK (char_length(feedback) <= 4000),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(assignment_id, student_id, attempt_number)
);

CREATE TRIGGER set_assignment_submissions_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_assignment_submissions_student ON public.assignment_submissions(student_id, submitted_at DESC);
CREATE INDEX idx_assignment_submissions_assignment ON public.assignment_submissions(assignment_id, submitted_at DESC);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity_created ON public.audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created ON public.audit_logs(actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.assignment_visible_to_current_student(p_assignment_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    JOIN public.profiles student ON student.id = auth.uid()
    WHERE assignment.id = p_assignment_id
      AND assignment.published_at IS NOT NULL
      AND public.is_verified_student()
      AND (assignment.target_major IS NULL OR assignment.target_major = student.major)
      AND (assignment.target_semester IS NULL OR assignment.target_semester = student.semester)
      AND (assignment.target_track IS NULL OR assignment.target_track = student.track)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_print_file(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.is_admin() OR public.is_committee_admin();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_assignment_attachment(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignments assignment
    WHERE assignment.attachment_path = p_storage_path
      AND (
        public.is_admin()
        OR assignment.doctor_id = auth.uid()
        OR public.assignment_visible_to_current_student(assignment.id)
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_read_submission_file(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.assignment_submissions submission
    JOIN public.assignments assignment ON assignment.id = submission.assignment_id
    WHERE submission.storage_path = p_storage_path
      AND (
        public.is_admin()
        OR submission.student_id = auth.uid()
        OR assignment.doctor_id = auth.uid()
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_verified_student() THEN
    RAISE EXCEPTION 'Verified student access is required';
  END IF;

  SELECT * INTO assignment_record
  FROM public.assignments
  WHERE id = p_assignment_id;

  IF assignment_record.id IS NULL OR NOT public.assignment_visible_to_current_student(p_assignment_id) THEN
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
  WHERE assignment_id = p_assignment_id AND student_id = auth.uid();

  IF next_attempt > assignment_record.max_submissions THEN
    RAISE EXCEPTION 'Maximum submission count reached';
  END IF;

  INSERT INTO public.assignment_submissions (
    assignment_id, student_id, attempt_number, storage_path, original_name,
    mime_type, size_bytes, message, status
  ) VALUES (
    p_assignment_id, auth.uid(), next_attempt, p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, COALESCE(p_message, ''),
    CASE WHEN assignment_record.due_at IS NOT NULL AND assignment_record.due_at < NOW()
      THEN 'late' ELSE 'submitted' END
  ) RETURNING * INTO submission_record;

  RETURN submission_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE OR REPLACE FUNCTION public.log_session_file_access(p_storage_path TEXT)
RETURNS VOID AS $$
DECLARE
  exam_id UUID;
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

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'opened', 'session_file', exam_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.audit_portal_change()
RETURNS TRIGGER AS $$
DECLARE
  row_data JSONB;
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
    target_id := OLD.id;
  ELSE
    row_data := to_jsonb(NEW);
    target_id := NEW.id;
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
    ))
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_print_documents_change
  AFTER INSERT OR UPDATE OR DELETE ON public.print_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE TRIGGER audit_assignments_change
  AFTER INSERT OR UPDATE OR DELETE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE TRIGGER audit_assignment_submissions_change
  AFTER INSERT OR UPDATE OR DELETE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

ALTER TABLE public.print_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "print_documents_select_owner_or_committee"
  ON public.print_documents FOR SELECT
  USING (doctor_id = auth.uid() OR public.is_committee_admin());

CREATE POLICY "print_documents_insert_doctor"
  ON public.print_documents FOR INSERT
  WITH CHECK (doctor_id = auth.uid() AND public.is_doctor());

CREATE POLICY "print_documents_update_doctor_requested"
  ON public.print_documents FOR UPDATE
  USING (doctor_id = auth.uid() AND public.is_doctor())
  WITH CHECK (doctor_id = auth.uid() AND status = 'requested');

CREATE POLICY "print_documents_update_committee"
  ON public.print_documents FOR UPDATE
  USING (public.is_committee_admin())
  WITH CHECK (public.is_committee_admin());

CREATE POLICY "assignments_select_doctor_or_student"
  ON public.assignments FOR SELECT
  USING (doctor_id = auth.uid() OR public.assignment_visible_to_current_student(id) OR public.is_admin());

CREATE POLICY "assignments_insert_doctor"
  ON public.assignments FOR INSERT
  WITH CHECK (doctor_id = auth.uid() AND public.is_doctor());

CREATE POLICY "assignments_update_doctor"
  ON public.assignments FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (doctor_id = auth.uid() OR public.is_admin());

CREATE POLICY "assignments_delete_doctor"
  ON public.assignments FOR DELETE
  USING (doctor_id = auth.uid() OR public.is_admin());

CREATE POLICY "submissions_select_owner_doctor_or_admin"
  ON public.assignment_submissions FOR SELECT
  USING (
    student_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments
      WHERE assignments.id = assignment_submissions.assignment_id
        AND assignments.doctor_id = auth.uid()
    )
  );

CREATE POLICY "submissions_update_doctor_or_admin"
  ON public.assignment_submissions FOR UPDATE
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments
      WHERE assignments.id = assignment_submissions.assignment_id
        AND assignments.doctor_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.assignments
      WHERE assignments.id = assignment_submissions.assignment_id
        AND assignments.doctor_id = auth.uid()
    )
  );

CREATE POLICY "audit_logs_select_admin_or_committee_print"
  ON public.audit_logs FOR SELECT
  USING (public.is_admin() OR (public.is_committee_admin() AND entity_type = 'print_documents'));

-- Session documents are private and visible only to verified portal users.
DROP POLICY IF EXISTS "previous_exams_select_public" ON public.previous_exams;
CREATE POLICY "previous_exams_select_verified_portal_users"
  ON public.previous_exams FOR SELECT
  USING (public.is_verified_student());

UPDATE storage.buckets SET public = FALSE WHERE id = 'exam-papers';
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('print-documents', 'print-documents', FALSE),
  ('assignment-attachments', 'assignment-attachments', FALSE),
  ('assignment-submissions', 'assignment-submissions', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "exam_papers_public_read" ON storage.objects;
CREATE POLICY "session_files_verified_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-papers' AND public.is_verified_student());

CREATE POLICY "print_documents_doctor_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'print-documents'
    AND public.is_doctor()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "print_documents_committee_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'print-documents' AND public.can_read_print_file(name));

CREATE POLICY "assignment_attachments_doctor_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assignment-attachments'
    AND public.is_doctor()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "assignment_attachments_authorized_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assignment-attachments' AND public.can_read_assignment_attachment(name));

CREATE POLICY "assignment_submissions_student_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assignment-submissions'
    AND public.is_verified_student()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "assignment_submissions_authorized_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'assignment-submissions' AND public.can_read_submission_file(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.print_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignments TO authenticated;
GRANT SELECT, UPDATE ON public.assignment_submissions TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_doctor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_committee_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_verified_student() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_assignment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_session_file_access(TEXT) TO authenticated;
