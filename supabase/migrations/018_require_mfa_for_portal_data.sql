-- Defence in depth: the client redirects AAL1 sessions into the TOTP flow,
-- and these restrictive RLS policies independently prevent an AAL1 JWT from
-- reading or changing portal-only data through the API. Service-role jobs are
-- unaffected because they bypass RLS.
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
      EXECUTE format(
        'CREATE POLICY require_aal2_for_portal_data ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((auth.jwt() ->> ''aal'') = ''aal2'') WITH CHECK ((auth.jwt() ->> ''aal'') = ''aal2'')',
        protected_table
      );
    END IF;
  END LOOP;
END $$;
