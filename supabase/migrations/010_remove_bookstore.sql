-- EduSphere v2 — migration 010
--
-- Removes the bookstore. Books were never delivered as PDFs through the
-- platform, so the catalogue, cart and order pipeline had no working fulfilment
-- path behind them.
--
-- DESTRUCTIVE. Drops: books, cart_items, orders, order_items, the book-covers
-- storage bucket, and all 'book' favourites. Take a backup first if any order
-- history is worth keeping:
--
--   supabase db dump --data-only -f backup-orders.sql
--
-- Everything else — exams, courses, events, assignments, materials — is
-- untouched.

-- ── Favourites: drop book rows, then narrow the allowed types ───────────────
DELETE FROM public.favorites WHERE item_type = 'book';

ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS favorites_item_type_check;

ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_item_type_check
  CHECK (item_type IN ('previous_exam', 'entrance_exam', 'event'));

COMMENT ON TABLE public.favorites IS 'User favorites for exams and events.';

-- ── Order pipeline ─────────────────────────────────────────────────────────
-- order_items → orders and order_items → books are both FK edges, so order
-- matters; CASCADE covers the dependent policies and indexes.
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders      CASCADE;
DROP TABLE IF EXISTS public.cart_items  CASCADE;
DROP TABLE IF EXISTS public.books       CASCADE;

-- ── Storage ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "book_covers_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "book_covers_admin_upload"  ON storage.objects;
DROP POLICY IF EXISTS "book_covers_admin_update"  ON storage.objects;
DROP POLICY IF EXISTS "book_covers_admin_delete"  ON storage.objects;

-- Storage object and bucket deletion must go through the Supabase Storage API.
-- Direct writes to storage.objects are rejected by Supabase's protection
-- trigger. Remove any `book-covers` objects and then the bucket through the
-- Storage API as part of deployment cleanup; this schema migration only
-- removes the database policies that supported the retired bookstore.

-- ── Dashboard RPCs ─────────────────────────────────────────────────────────
-- Both counted books and orders. Their return signatures change, so they must
-- be dropped rather than CREATE OR REPLACE'd. The new shapes replace the
-- bookstore columns with academics, which is what the redesigned dashboard
-- actually shows.

DROP FUNCTION IF EXISTS public.get_dashboard_stats()                  CASCADE;
DROP FUNCTION IF EXISTS public.get_user_dashboard_stats(TEXT, TEXT)   CASCADE;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(
  total_exams          INTEGER,
  total_entrance_exams INTEGER,
  total_events         INTEGER,
  total_courses        INTEGER,
  total_materials      INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.previous_exams)::INTEGER,
    (SELECT COUNT(*) FROM public.entrance_exams)::INTEGER,
    (SELECT COUNT(*) FROM public.events)::INTEGER,
    (SELECT COUNT(*) FROM public.courses)::INTEGER,
    (SELECT COUNT(*) FROM public.course_materials WHERE published_at IS NOT NULL)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(
  p_major    TEXT DEFAULT NULL,
  p_semester TEXT DEFAULT NULL
)
RETURNS TABLE(
  exams_for_major     INTEGER,
  exams_for_semester  INTEGER,
  upcoming_events     INTEGER,
  user_favorites      INTEGER,
  enrolled_courses    INTEGER,
  pending_assignments INTEGER
) AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_major    TEXT := p_major;
  v_semester TEXT := p_semester;
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.previous_exams
              WHERE major = v_major), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.previous_exams
              WHERE major = v_major AND semester = v_semester), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.events
              WHERE type = 'upcoming'), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.favorites
              WHERE user_id = v_user_id), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.student_enrollments
              WHERE student_id = v_user_id AND status = 'enrolled'), 0)::INTEGER,
    COALESCE((SELECT COUNT(*)
              FROM public.assignments assignment
              WHERE assignment.published_at IS NOT NULL
                AND (assignment.due_at IS NULL OR assignment.due_at > NOW())
                AND public.assignment_visible_to_current_student(assignment.id)
                AND NOT EXISTS (
                  SELECT 1 FROM public.assignment_submissions submission
                  WHERE submission.assignment_id = assignment.id
                    AND submission.student_id = v_user_id
                )), 0)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats(TEXT, TEXT) TO authenticated;
