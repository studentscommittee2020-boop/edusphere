-- Target council book proposals to explicit, university-verified teaching
-- assignments. One proposal can target several doctors, but every selected
-- assignment must be for the exact same course/language represented by the
-- uploaded book.

CREATE OR REPLACE FUNCTION public.get_council_doctor_course_options()
RETURNS TABLE (
  doctor_course_id UUID,
  doctor_id UUID,
  doctor_name TEXT,
  course_id UUID,
  course_code TEXT,
  course_title TEXT,
  course_title_fr TEXT,
  language TEXT,
  semester TEXT,
  academic_year TEXT,
  major TEXT
) AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only the council or an admin may view teaching assignments';
  END IF;

  RETURN QUERY
  SELECT dc.id, dc.doctor_id, profile.full_name, course.id, course.code,
         course.title, course.title_fr, course.track, dc.semester,
         dc.academic_year, course.major
    FROM public.doctor_courses AS dc
    JOIN public.profiles AS profile ON profile.id = dc.doctor_id
    JOIN public.courses AS course ON course.id = dc.course_id
   WHERE dc.is_active
     AND profile.role = 'doctor'
   ORDER BY course.track, course.title, dc.academic_year DESC,
            dc.semester, profile.full_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.get_council_doctor_course_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_council_doctor_course_options() TO authenticated;

CREATE OR REPLACE FUNCTION public.upload_course_book_for_assignments(
  p_course_id UUID,
  p_doctor_course_ids UUID[],
  p_title TEXT,
  p_storage_path TEXT,
  p_original_name TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT
)
RETURNS public.course_books AS $$
DECLARE
  v_course public.courses;
  v_actor UUID := public.effective_user_id();
  v_book public.course_books;
  v_requested INTEGER;
  v_valid INTEGER;
BEGIN
  IF NOT (public.is_committee_admin() OR public.is_admin())
     OR NOT (public.is_target_role(v_actor, 'committee_admin')
             OR public.is_target_role(v_actor, 'admin')) THEN
    RAISE EXCEPTION 'Only the council or an admin may upload a course book';
  END IF;

  v_requested := COALESCE(cardinality(p_doctor_course_ids), 0);
  IF v_requested < 1 OR v_requested > 100 THEN
    RAISE EXCEPTION 'Select between 1 and 100 teaching assignments';
  END IF;
  IF v_requested <> (SELECT COUNT(DISTINCT requested.id)
                        FROM unnest(p_doctor_course_ids) AS requested(id)) THEN
    RAISE EXCEPTION 'Teaching assignments must be unique';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF v_course.id IS NULL THEN RAISE EXCEPTION 'Unknown course'; END IF;

  SELECT COUNT(*) INTO v_valid
    FROM public.doctor_courses AS dc
    JOIN public.profiles AS profile ON profile.id = dc.doctor_id
   WHERE dc.id = ANY(p_doctor_course_ids)
     AND dc.course_id = p_course_id
     AND dc.is_active
     AND profile.role = 'doctor';
  IF v_valid <> v_requested THEN
    RAISE EXCEPTION 'Every selected doctor must actively teach this exact course and language';
  END IF;

  IF char_length(btrim(COALESCE(p_title, ''))) < 2
     OR char_length(btrim(p_title)) > 200 THEN
    RAISE EXCEPTION 'Use a book title between 2 and 200 characters';
  END IF;
  IF p_mime_type NOT IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ) OR p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 157286400 THEN
    RAISE EXCEPTION 'Only PDF or PowerPoint files up to 150 MB are accepted';
  END IF;
  IF p_storage_path NOT LIKE auth.uid()::TEXT || '/%'
     OR NOT EXISTS (
       SELECT 1 FROM storage.objects
        WHERE bucket_id = 'course-books' AND name = p_storage_path
     ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  INSERT INTO public.course_books (
    course_id, course_title, course_title_fr, title, uploaded_by,
    storage_path, original_name, mime_type, size_bytes, status
  ) VALUES (
    v_course.id, v_course.title, v_course.title_fr, btrim(p_title), v_actor,
    p_storage_path, p_original_name, p_mime_type, p_size_bytes,
    'pending_doctor_review'
  ) RETURNING * INTO v_book;

  INSERT INTO public.course_book_reviews (book_id, doctor_course_id, doctor_id)
  SELECT v_book.id, dc.id, dc.doctor_id
    FROM public.doctor_courses AS dc
   WHERE dc.id = ANY(p_doctor_course_ids);

  RETURN v_book;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

REVOKE ALL ON FUNCTION public.upload_course_book_for_assignments(
  UUID, UUID[], TEXT, TEXT, TEXT, TEXT, BIGINT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upload_course_book_for_assignments(
  UUID, UUID[], TEXT, TEXT, TEXT, TEXT, BIGINT
) TO authenticated;

-- Broad, course-wide proposals are no longer permitted. Every new council
-- upload must name its intended university-verified assignments.
REVOKE EXECUTE ON FUNCTION public.upload_course_book(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT
) FROM authenticated;

CREATE OR REPLACE FUNCTION public.review_course_book(
  p_book_id UUID,
  p_doctor_course_id UUID,
  p_decision TEXT
)
RETURNS public.course_book_reviews AS $$
DECLARE
  v_actor UUID := public.effective_user_id();
  v_review public.course_book_reviews;
BEGIN
  IF NOT public.is_doctor() OR NOT public.is_target_role(v_actor, 'doctor') THEN
    RAISE EXCEPTION 'Only the assigned doctor may review this book';
  END IF;
  IF p_decision <> 'confirmed' THEN
    RAISE EXCEPTION 'Rejecting a council book requires a replacement file and reason';
  END IF;

  SELECT review.* INTO v_review
    FROM public.course_book_reviews AS review
    JOIN public.doctor_courses AS dc ON dc.id = review.doctor_course_id
    JOIN public.course_books AS book ON book.id = review.book_id
   WHERE review.book_id = p_book_id
     AND review.doctor_course_id = p_doctor_course_id
     AND review.doctor_id = v_actor
     AND review.status = 'pending'
     AND dc.doctor_id = v_actor
     AND dc.is_active
     AND dc.course_id = book.course_id
     AND book.restricted_to_doctor_id IS NULL
     AND book.status = 'pending_doctor_review'
   FOR UPDATE OF review;

  IF v_review.id IS NULL THEN
    RAISE EXCEPTION 'This book is not assigned to this doctor for review';
  END IF;

  UPDATE public.course_book_reviews
     SET status = p_decision, reviewed_by = v_actor, reviewed_at = NOW(),
         rejection_reason = '', replacement_book_id = NULL
   WHERE id = v_review.id
   RETURNING * INTO v_review;
  RETURN v_review;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.review_course_book(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_course_book(UUID, UUID, TEXT) TO authenticated;

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
  SELECT * INTO v_assignment FROM public.doctor_courses
   WHERE id = p_doctor_course_id AND doctor_id = v_actor AND is_active;
  IF v_original.id IS NULL OR v_assignment.id IS NULL
     OR v_original.course_id <> v_assignment.course_id
     OR v_original.restricted_to_doctor_id IS NOT NULL
     OR v_original.status <> 'pending_doctor_review'
     OR NOT EXISTS (
       SELECT 1 FROM public.course_book_reviews AS review
        WHERE review.book_id = v_original.id
          AND review.doctor_course_id = v_assignment.id
          AND review.doctor_id = v_actor
          AND review.status = 'pending'
     ) THEN
    RAISE EXCEPTION 'This book is not assigned to this doctor for review';
  END IF;
  IF char_length(btrim(COALESCE(p_rejection_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;
  IF char_length(btrim(COALESCE(p_title, ''))) < 2 OR char_length(btrim(p_title)) > 200 THEN
    RAISE EXCEPTION 'A replacement book title is required';
  END IF;
  IF p_mime_type NOT IN (
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'application/vnd.ms-powerpoint'
     ) OR p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 157286400
       OR p_storage_path NOT LIKE auth.uid()::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid replacement file';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
     WHERE bucket_id = 'course-books' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded replacement file was not found';
  END IF;

  INSERT INTO public.course_books (
    course_id, course_title, course_title_fr, title, uploaded_by, storage_path,
    original_name, mime_type, size_bytes, status, replaces_book_id,
    restricted_to_doctor_id
  ) VALUES (
    v_original.course_id, v_original.course_title, v_original.course_title_fr,
    btrim(p_title), v_actor, p_storage_path, p_original_name, p_mime_type,
    p_size_bytes, 'pending_council_review', v_original.id, v_actor
  ) RETURNING * INTO v_replacement;

  UPDATE public.course_book_reviews
     SET status = 'rejected', reviewed_by = v_actor, reviewed_at = NOW(),
         rejection_reason = btrim(p_rejection_reason),
         replacement_book_id = v_replacement.id
   WHERE book_id = v_original.id
     AND doctor_course_id = v_assignment.id
     AND doctor_id = v_actor;

  INSERT INTO public.course_book_reviews (book_id, doctor_course_id, doctor_id)
  VALUES (v_replacement.id, v_assignment.id, v_actor);
  RETURN v_replacement;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

REVOKE ALL ON FUNCTION public.submit_doctor_book_replacement(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_doctor_book_replacement(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT
) TO authenticated;

DROP POLICY IF EXISTS "course_books_select_participant_or_staff" ON public.course_books;
CREATE POLICY "course_books_select_participant_or_staff"
  ON public.course_books FOR SELECT
  USING (
    public.is_admin()
    OR public.is_committee_admin()
    OR (
      restricted_to_doctor_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.doctor_courses AS dc
         WHERE dc.doctor_id = auth.uid()
           AND dc.course_id = course_books.course_id
           AND dc.is_active
      )
    )
    OR (
      restricted_to_doctor_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.course_book_reviews AS review
        JOIN public.doctor_courses AS dc ON dc.id = review.doctor_course_id
         WHERE review.book_id = course_books.id
           AND review.doctor_id = auth.uid()
           AND dc.doctor_id = auth.uid()
           AND dc.is_active
      )
    )
  );

CREATE OR REPLACE FUNCTION public.can_read_course_book(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_books AS book
     WHERE book.storage_path = p_storage_path
       AND (
         public.is_admin()
         OR public.is_committee_admin()
         OR (
           book.restricted_to_doctor_id = auth.uid()
           AND EXISTS (
             SELECT 1 FROM public.doctor_courses AS dc
              WHERE dc.doctor_id = auth.uid()
                AND dc.course_id = book.course_id
                AND dc.is_active
           )
         )
         OR (
           book.restricted_to_doctor_id IS NULL
           AND EXISTS (
             SELECT 1 FROM public.course_book_reviews AS review
             JOIN public.doctor_courses AS dc ON dc.id = review.doctor_course_id
              WHERE review.book_id = book.id
                AND review.doctor_id = auth.uid()
                AND dc.doctor_id = auth.uid()
                AND dc.is_active
           )
         )
       )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_council_book_replacement_context()
RETURNS TABLE (
  book_id UUID,
  doctor_id UUID,
  doctor_name TEXT,
  doctor_course_id UUID,
  course_id UUID,
  course_code TEXT,
  course_title TEXT,
  course_title_fr TEXT,
  language TEXT,
  semester TEXT,
  academic_year TEXT
) AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only the council or an admin may review replacements';
  END IF;

  RETURN QUERY
  SELECT book.id, dc.doctor_id, profile.full_name, dc.id, course.id,
         course.code, course.title, course.title_fr, course.track,
         dc.semester, dc.academic_year
    FROM public.course_books AS book
    JOIN public.course_book_reviews AS review ON review.book_id = book.id
    JOIN public.doctor_courses AS dc ON dc.id = review.doctor_course_id
    JOIN public.profiles AS profile ON profile.id = dc.doctor_id
    JOIN public.courses AS course ON course.id = dc.course_id
   WHERE book.status = 'pending_council_review'
     AND book.restricted_to_doctor_id = dc.doctor_id
   ORDER BY book.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.get_council_book_replacement_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_council_book_replacement_context() TO authenticated;
