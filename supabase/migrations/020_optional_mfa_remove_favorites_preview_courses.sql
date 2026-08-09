-- Authenticator MFA is opt-in. Accounts that enroll a verified factor still
-- complete it on sign-in, but AAL1 users are no longer denied portal data.
DO $$
DECLARE
  protected_table TEXT;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY[
    'print_documents', 'assignments', 'assignment_submissions', 'audit_logs',
    'student_enrollments', 'schedule_entries', 'academic_sync_state',
    'course_materials', 'telemetry_events', 'impersonation_sessions',
    'doctor_courses', 'exam_submissions', 'exam_reports',
    'exam_download_events', 'course_books', 'course_book_reviews',
    'instructor_aliases'
  ]
  LOOP
    IF to_regclass(format('public.%I', protected_table)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS require_aal2_for_portal_data ON public.%I', protected_table);
    END IF;
  END LOOP;
END $$;

-- Migration 019 calls this guard inside its protected workflow RPCs. Keep the
-- function as a compatibility seam, but make it a no-op now that enrollment
-- is optional. Enrolled factors are still challenged by the application gate.
CREATE OR REPLACE FUNCTION public.require_portal_mfa()
RETURNS VOID AS $$
BEGIN
  RETURN;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

REVOKE ALL ON FUNCTION public.require_portal_mfa() FROM PUBLIC, anon, authenticated;

-- Favorites have been removed from the product. Drop the dependent, unused
-- dashboard RPC first so the table can be removed without CASCADE hiding an
-- unexpected dependency.
DROP FUNCTION IF EXISTS public.get_user_dashboard_stats(TEXT, TEXT);
DROP TABLE IF EXISTS public.favorites;

-- Give the prepared doctor account a representative multi-level,
-- multi-major, bilingual teaching load so reviewers can exercise the real
-- doctor workspace before the university teaching API is connected.
DO $$
DECLARE
  review_doctor_id UUID;
BEGIN
  SELECT user_row.id
    INTO review_doctor_id
    FROM auth.users AS user_row
    JOIN public.profiles AS profile ON profile.id = user_row.id
   WHERE lower(user_row.email) = 'review-doctor@edusphere.local'
     AND profile.role = 'doctor'
   LIMIT 1;

  IF review_doctor_id IS NULL THEN
    RAISE NOTICE 'Prepared doctor account does not exist yet; preview course seed skipped.';
    RETURN;
  END IF;

  INSERT INTO public.doctor_courses (
    doctor_id,
    course_id,
    academic_year,
    semester,
    is_active,
    schedule_synced_at
  )
  SELECT
    review_doctor_id,
    course.id,
    '2026-2027',
    course.semester,
    TRUE,
    NULL
  FROM public.courses AS course
  WHERE course.code IN ('fc1', 'ec8', 'ff1', 'ea5')
  ON CONFLICT (doctor_id, course_id, academic_year, semester)
  DO UPDATE SET is_active = TRUE, schedule_synced_at = NULL;
END $$;
