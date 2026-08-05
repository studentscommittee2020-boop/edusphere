-- EduSphere v2 -- migration 016
--
-- Corrects the initial course-book implementation to match the approved
-- operating model:
--   * a council proposal is reviewed independently by each teaching doctor;
--   * a doctor's replacement is private to that doctor, council, admin and
--     owner; it never becomes another doctor's candidate;
--   * course-book rows are immutable to ordinary PostgREST updates -- named
--     SECURITY DEFINER functions are the only workflow write paths;
--   * doctor teaching assignments are derived from resolved university
--     schedule records, not self-declared by doctors.
--
-- This migration follows 014 deliberately rather than rewriting it: it is
-- safe whether 014 has already been applied to a disposable review database
-- or is applied immediately before this migration on first launch.

-- --------------------------------------------------------------------------
-- 1. Per-doctor book-review records and private replacements
-- --------------------------------------------------------------------------

ALTER TABLE public.course_books
  ADD COLUMN restricted_to_doctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.doctor_courses
  ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN schedule_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.doctor_courses.is_active IS
  'TRUE only while an alias-resolved university schedule record authorises this teaching assignment. Historical rows are retained inactive for audit but grant no student, material, book or print-count access.';

COMMENT ON COLUMN public.course_books.restricted_to_doctor_id IS
  'NULL for a council proposal visible to every currently assigned teaching doctor. Set only for a doctor replacement: then only that doctor, council, admin and owner can read it.';

CREATE TABLE public.course_book_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id           UUID NOT NULL REFERENCES public.course_books(id) ON DELETE CASCADE,
  doctor_course_id  UUID NOT NULL REFERENCES public.doctor_courses(id) ON DELETE CASCADE,
  doctor_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reviewed_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT NOT NULL DEFAULT '' CHECK (char_length(rejection_reason) <= 2000),
  replacement_book_id UUID REFERENCES public.course_books(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (book_id, doctor_course_id),
  CHECK (status <> 'rejected' OR char_length(btrim(rejection_reason)) > 0)
);

CREATE TRIGGER set_course_book_reviews_updated_at
  BEFORE UPDATE ON public.course_book_reviews
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER audit_course_book_reviews_change
  AFTER INSERT OR UPDATE OR DELETE ON public.course_book_reviews
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE INDEX idx_course_book_reviews_doctor_course
  ON public.course_book_reviews(doctor_course_id, status);

ALTER TABLE public.course_book_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_book_reviews_select_participant_or_staff"
  ON public.course_book_reviews FOR SELECT
  USING (doctor_id = auth.uid() OR public.is_admin() OR public.is_committee_admin());

GRANT SELECT ON public.course_book_reviews TO authenticated;

-- The original 014 policy contradicted its own RPC-only workflow: any
-- teaching doctor could directly change a book's status, path or reviewer.
-- Course-book rows are now immutable through PostgREST. Owner access remains
-- through the explicit owner policy installed at the end of this migration.
DROP POLICY IF EXISTS "course_books_update_council_or_teaching_doctor" ON public.course_books;
DROP POLICY IF EXISTS "course_books_select_council_or_teaching_doctor" ON public.course_books;

CREATE POLICY "course_books_select_participant_or_staff"
  ON public.course_books FOR SELECT
  USING (
    public.is_admin()
    OR public.is_committee_admin()
    OR EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid()
        AND dc.course_id = course_books.course_id
        AND dc.is_active
        AND (course_books.restricted_to_doctor_id IS NULL
             OR course_books.restricted_to_doctor_id = auth.uid())
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.course_books FROM authenticated;
GRANT SELECT ON public.course_books TO authenticated;

-- Existing 014 transitions are book-wide and therefore no longer callable.
-- The initial council upload remains usable by the upload Edge Function; no
-- browser can create a storage object directly after the storage policy below.
REVOKE EXECUTE ON FUNCTION public.confirm_course_book(UUID) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_course_book(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM authenticated;

CREATE OR REPLACE FUNCTION public.review_course_book(
  p_book_id UUID,
  p_doctor_course_id UUID,
  p_decision TEXT
)
RETURNS public.course_book_reviews AS $$
DECLARE
  v_book public.course_books;
  v_assignment public.doctor_courses;
  v_actor UUID := public.effective_user_id();
  v_review public.course_book_reviews;
BEGIN
  IF NOT public.is_doctor() OR NOT public.is_target_role(v_actor, 'doctor') THEN
    RAISE EXCEPTION 'Only the assigned doctor may review this book';
  END IF;
  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'A doctor review must confirm or reject the book';
  END IF;

  SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id;
  SELECT * INTO v_assignment FROM public.doctor_courses
    WHERE id = p_doctor_course_id AND doctor_id = v_actor AND is_active;
  IF v_book.id IS NULL OR v_assignment.id IS NULL
     OR v_book.course_id <> v_assignment.course_id
     OR v_book.restricted_to_doctor_id IS NOT NULL
     OR v_book.status <> 'pending_doctor_review' THEN
    RAISE EXCEPTION 'This book is not awaiting this doctor''s review';
  END IF;

  INSERT INTO public.course_book_reviews (book_id, doctor_course_id, doctor_id, status, reviewed_by, reviewed_at)
  VALUES (v_book.id, v_assignment.id, v_actor, p_decision, v_actor, NOW())
  ON CONFLICT (book_id, doctor_course_id) DO UPDATE SET
    status = EXCLUDED.status, reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at, rejection_reason = '', replacement_book_id = NULL
  RETURNING * INTO v_review;
  RETURN v_review;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.submit_doctor_book_replacement(
  p_book_id UUID,
  p_doctor_course_id UUID,
  p_title TEXT,
  p_storage_path TEXT,
  p_original_name TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT,
  p_rejection_reason TEXT
)
RETURNS public.course_books AS $$
DECLARE
  v_original public.course_books;
  v_assignment public.doctor_courses;
  v_actor UUID := public.effective_user_id();
  v_replacement public.course_books;
BEGIN
  IF NOT public.is_doctor() OR NOT public.is_target_role(v_actor, 'doctor') THEN
    RAISE EXCEPTION 'Only the assigned doctor may submit a replacement';
  END IF;
  SELECT * INTO v_original FROM public.course_books WHERE id = p_book_id;
  SELECT * INTO v_assignment FROM public.doctor_courses WHERE id = p_doctor_course_id AND doctor_id = v_actor AND is_active;
  IF v_original.id IS NULL OR v_assignment.id IS NULL
     OR v_original.course_id <> v_assignment.course_id
     OR v_original.restricted_to_doctor_id IS NOT NULL
     OR v_original.status <> 'pending_doctor_review' THEN
    RAISE EXCEPTION 'This book is not awaiting this doctor''s review';
  END IF;
  IF char_length(btrim(COALESCE(p_rejection_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) < 2 OR char_length(btrim(p_title)) > 200 THEN
    RAISE EXCEPTION 'A replacement book title is required';
  END IF;
  IF p_mime_type NOT IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.ms-powerpoint')
     OR p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 157286400
     OR p_storage_path NOT LIKE v_actor::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid replacement file';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'course-books' AND name = p_storage_path) THEN
    RAISE EXCEPTION 'Uploaded replacement file was not found';
  END IF;

  INSERT INTO public.course_books (
    course_id, course_title, course_title_fr, title, uploaded_by, storage_path,
    original_name, mime_type, size_bytes, status, replaces_book_id, restricted_to_doctor_id
  ) VALUES (
    v_original.course_id, v_original.course_title, v_original.course_title_fr,
    btrim(p_title), v_actor, p_storage_path, p_original_name, p_mime_type,
    p_size_bytes, 'pending_council_review', v_original.id, v_actor
  ) RETURNING * INTO v_replacement;

  INSERT INTO public.course_book_reviews (
    book_id, doctor_course_id, doctor_id, status, reviewed_by, reviewed_at, rejection_reason, replacement_book_id
  ) VALUES (
    v_original.id, v_assignment.id, v_actor, 'rejected', v_actor, NOW(),
    btrim(p_rejection_reason), v_replacement.id
  ) ON CONFLICT (book_id, doctor_course_id) DO UPDATE SET
    status = 'rejected', reviewed_by = v_actor, reviewed_at = NOW(),
    rejection_reason = btrim(p_rejection_reason), replacement_book_id = v_replacement.id;

  INSERT INTO public.course_book_reviews (book_id, doctor_course_id, doctor_id)
  VALUES (v_replacement.id, v_assignment.id, v_actor);
  RETURN v_replacement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.review_doctor_book_replacement(
  p_book_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT ''
)
RETURNS public.course_books AS $$
DECLARE
  v_book public.course_books;
  v_actor UUID := public.effective_user_id();
  v_status TEXT;
BEGIN
  IF NOT (public.is_committee_admin() OR public.is_admin())
     OR NOT (public.is_target_role(v_actor, 'committee_admin') OR public.is_target_role(v_actor, 'admin')) THEN
    RAISE EXCEPTION 'Only the council or an admin may review a replacement';
  END IF;
  IF p_decision NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'A replacement review must confirm or reject the book';
  END IF;
  SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id FOR UPDATE;
  IF v_book.id IS NULL OR v_book.restricted_to_doctor_id IS NULL OR v_book.status <> 'pending_council_review' THEN
    RAISE EXCEPTION 'This replacement is not awaiting council review';
  END IF;
  IF p_decision = 'rejected' AND char_length(btrim(COALESCE(p_rejection_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  v_status := CASE WHEN p_decision = 'confirmed' THEN 'confirmed' ELSE 'rejected' END;
  UPDATE public.course_books SET status = v_status, reviewed_by = v_actor, reviewed_at = NOW(),
    rejection_reason = CASE WHEN v_status = 'rejected' THEN btrim(p_rejection_reason) ELSE '' END
    WHERE id = v_book.id RETURNING * INTO v_book;
  UPDATE public.course_book_reviews SET status = v_status, reviewed_by = v_actor, reviewed_at = NOW(),
    rejection_reason = CASE WHEN v_status = 'rejected' THEN btrim(p_rejection_reason) ELSE '' END
    WHERE book_id = v_book.id AND doctor_id = v_book.restricted_to_doctor_id;
  RETURN v_book;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- A selection is valid only for the exact teaching assignment whose doctor
-- has confirmed the council proposal, or whose private replacement council
-- has confirmed. This replaces 014's global-book confirmation test.
CREATE OR REPLACE FUNCTION public.select_course_book(
  p_doctor_courses_id UUID,
  p_book_id UUID
)
RETURNS public.doctor_courses AS $$
DECLARE
  v_assignment public.doctor_courses;
  v_book public.course_books;
  v_actor UUID := public.effective_user_id();
BEGIN
  IF NOT public.is_doctor() OR NOT public.is_target_role(v_actor, 'doctor') THEN
    RAISE EXCEPTION 'Only the assigned doctor may select a course book';
  END IF;
  SELECT * INTO v_assignment FROM public.doctor_courses WHERE id = p_doctor_courses_id AND doctor_id = v_actor AND is_active FOR UPDATE;
  SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id;
  IF v_assignment.id IS NULL OR v_book.id IS NULL OR v_assignment.course_id <> v_book.course_id
     OR (v_book.restricted_to_doctor_id IS NOT NULL AND v_book.restricted_to_doctor_id <> v_actor)
     OR NOT EXISTS (
       SELECT 1 FROM public.course_book_reviews review
       WHERE review.book_id = v_book.id AND review.doctor_course_id = v_assignment.id
         AND review.doctor_id = v_actor AND review.status = 'confirmed'
     ) THEN
    RAISE EXCEPTION 'This book is not confirmed for this teaching assignment';
  END IF;
  UPDATE public.doctor_courses SET selected_book_id = v_book.id WHERE id = v_assignment.id RETURNING * INTO v_assignment;
  RETURN v_assignment;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.review_course_book(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_doctor_book_replacement(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_doctor_book_replacement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.select_course_book(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_course_book(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_doctor_book_replacement(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_doctor_book_replacement(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_course_book(UUID, UUID) TO authenticated;

CREATE OR REPLACE VIEW public.course_book_print_counts AS
  SELECT
    book.id AS book_id, book.course_id, book.course_title, book.course_title_fr,
    book.title AS book_title, book.status AS book_status,
    dc.academic_year, dc.semester,
    COUNT(DISTINCT se.student_id) AS attributed_student_count,
    (
      SELECT COUNT(DISTINCT se2.student_id)
      FROM public.schedule_entries se2
      WHERE se2.course_id = book.course_id
        AND se2.academic_year = dc.academic_year
        AND se2.semester = dc.semester
        AND se2.instructor_id IS NULL
    ) AS unattributed_student_count
  FROM public.course_books book
  JOIN public.doctor_courses dc ON dc.selected_book_id = book.id AND dc.is_active
  LEFT JOIN public.schedule_entries se
    ON se.instructor_id = dc.doctor_id AND se.course_id = dc.course_id
    AND se.academic_year = dc.academic_year AND se.semester = dc.semester
  WHERE public.is_admin() OR public.is_committee_admin()
  GROUP BY book.id, book.course_id, book.course_title, book.course_title_fr,
    book.title, book.status, dc.academic_year, dc.semester;

-- --------------------------------------------------------------------------
-- 2. Private bucket read/write rules
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_course_book(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_books book
    WHERE book.storage_path = p_storage_path
      AND (
        public.is_admin() OR public.is_committee_admin()
        OR EXISTS (
          SELECT 1 FROM public.doctor_courses dc
          WHERE dc.doctor_id = auth.uid() AND dc.course_id = book.course_id
            AND dc.is_active
            AND (book.restricted_to_doctor_id IS NULL OR book.restricted_to_doctor_id = auth.uid())
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "course_books_upload_council_or_doctor" ON storage.objects;
DROP POLICY IF EXISTS "course_books_authorized_read" ON storage.objects;
CREATE POLICY "course_books_authorized_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-books' AND public.can_read_course_book(name));

-- No browser INSERT policy: course-book-upload validates file signatures,
-- size and actor before the service role stores an object, then calls the
-- appropriate workflow RPC. This prevents unregistered/orphaned browser
-- uploads and client-declared MIME type from becoming an authoritative file.

-- --------------------------------------------------------------------------
-- 3. Authoritative teaching assignments from alias-resolved schedules
-- --------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.set_doctor_courses(JSONB) FROM authenticated;

CREATE OR REPLACE FUNCTION public.sync_doctor_courses_from_schedule()
RETURNS TABLE (inserted_count INTEGER, removed_count INTEGER, unresolved_count INTEGER) AS $$
DECLARE
  v_inserted INTEGER;
  v_removed INTEGER;
  v_unresolved INTEGER;
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only staff may synchronize teaching assignments';
  END IF;
  CREATE TEMP TABLE desired_doctor_courses ON COMMIT DROP AS
    SELECT DISTINCT instructor_id AS doctor_id, course_id, academic_year, semester
    FROM public.schedule_entries WHERE instructor_id IS NOT NULL;

  INSERT INTO public.doctor_courses (doctor_id, course_id, academic_year, semester, is_active, schedule_synced_at)
  SELECT doctor_id, course_id, academic_year, semester, TRUE, NOW() FROM desired_doctor_courses
  ON CONFLICT (doctor_id, course_id, academic_year, semester) DO UPDATE SET
    is_active = TRUE, schedule_synced_at = NOW();
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.doctor_courses dc SET is_active = FALSE, schedule_synced_at = NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM desired_doctor_courses desired
    WHERE desired.doctor_id = dc.doctor_id AND desired.course_id = dc.course_id
      AND desired.academic_year = dc.academic_year AND desired.semester = dc.semester
  ) AND dc.is_active;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  SELECT COUNT(*) INTO v_unresolved FROM public.schedule_entries
    WHERE instructor_id IS NULL AND btrim(instructor) <> '';
  RETURN QUERY SELECT v_inserted, v_removed, v_unresolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.sync_doctor_courses_from_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_doctor_courses_from_schedule() TO authenticated;

DROP POLICY IF EXISTS "enrollments_select_self_or_staff" ON public.student_enrollments;
CREATE POLICY "enrollments_select_self_or_staff"
  ON public.student_enrollments FOR SELECT
  USING (
    student_id = auth.uid() OR public.is_admin() OR EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = student_enrollments.course_id
        AND dc.academic_year = student_enrollments.academic_year
        AND dc.semester = student_enrollments.semester AND dc.is_active
    )
  );

DROP POLICY IF EXISTS "assignments_insert_doctor" ON public.assignments;
CREATE POLICY "assignments_insert_doctor" ON public.assignments FOR INSERT WITH CHECK (
  doctor_id = auth.uid() AND public.is_doctor() AND course_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.doctor_courses dc
    WHERE dc.doctor_id = auth.uid() AND dc.course_id = assignments.course_id AND dc.is_active
  )
);

DROP POLICY IF EXISTS "assignments_update_doctor" ON public.assignments;
CREATE POLICY "assignments_update_doctor" ON public.assignments FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (public.is_admin() OR (
    doctor_id = auth.uid() AND course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = assignments.course_id AND dc.is_active
    )
  ));

DROP POLICY IF EXISTS "course_materials_insert_doctor" ON public.course_materials;
CREATE POLICY "course_materials_insert_doctor" ON public.course_materials FOR INSERT WITH CHECK (
  doctor_id = auth.uid() AND public.is_doctor() AND EXISTS (
    SELECT 1 FROM public.doctor_courses dc
    WHERE dc.doctor_id = auth.uid() AND dc.course_id = course_materials.course_id AND dc.is_active
  )
);

DROP POLICY IF EXISTS "course_materials_update_doctor" ON public.course_materials;
CREATE POLICY "course_materials_update_doctor" ON public.course_materials FOR UPDATE
  USING (doctor_id = auth.uid() OR public.is_admin())
  WITH CHECK (public.is_admin() OR (
    doctor_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = course_materials.course_id AND dc.is_active
    )
  ));

DO $$
BEGIN
  PERFORM public.grant_owner_full_access('course_book_reviews');
END $$;
