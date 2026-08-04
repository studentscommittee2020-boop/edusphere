-- ============================================================================
-- EduSphere v2 -- RPC Functions (Dashboard & Admin)
-- Created: 2026-04-23
-- ============================================================================

-- ============================================================================
-- RPC: get_dashboard_stats
-- Returns global statistics for dashboard display
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(
  total_exams INTEGER,
  total_entrance_exams INTEGER,
  total_books INTEGER,
  total_events INTEGER,
  total_courses INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.previous_exams)::INTEGER,
    (SELECT COUNT(*) FROM public.entrance_exams)::INTEGER,
    (SELECT COUNT(*) FROM public.books)::INTEGER,
    (SELECT COUNT(*) FROM public.events)::INTEGER,
    (SELECT COUNT(*) FROM public.courses)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO anon, authenticated;

-- ============================================================================
-- RPC: get_user_dashboard_stats
-- Returns personalized statistics filtered by major and semester
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(
  p_major TEXT DEFAULT NULL,
  p_semester TEXT DEFAULT NULL
)
RETURNS TABLE(
  exams_for_major INTEGER,
  exams_for_semester INTEGER,
  books_for_major INTEGER,
  upcoming_events INTEGER,
  user_favorites INTEGER,
  user_orders INTEGER
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_major TEXT := COALESCE(p_major, NULL);
  v_semester TEXT := COALESCE(p_semester, NULL);
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((SELECT COUNT(*) FROM public.previous_exams WHERE major = v_major), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.previous_exams WHERE major = v_major AND semester = v_semester), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.books WHERE major = v_major), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.events WHERE type = 'upcoming'), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.favorites WHERE user_id = v_user_id), 0)::INTEGER,
    COALESCE((SELECT COUNT(*) FROM public.orders WHERE user_id = v_user_id), 0)::INTEGER;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- RPC: get_recommended_exams
-- Returns recommended exams based on major and semester (highest rated)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_recommended_exams(
  p_major TEXT,
  p_semester TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE(
  id UUID,
  course_id UUID,
  course_title TEXT,
  course_title_fr TEXT,
  major TEXT,
  semester TEXT,
  year TEXT,
  exam_type TEXT,
  pages INTEGER,
  rating NUMERIC,
  track TEXT,
  file_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.id,
    pe.course_id,
    pe.course_title,
    pe.course_title_fr,
    pe.major,
    pe.semester,
    pe.year,
    pe.exam_type,
    pe.pages,
    pe.rating,
    pe.track,
    pe.file_url,
    pe.created_at,
    pe.updated_at
  FROM public.previous_exams pe
  WHERE pe.major = p_major
    AND (p_semester IS NULL OR pe.semester = p_semester)
  ORDER BY pe.rating DESC, pe.year DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_recommended_exams(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- ============================================================================
-- RPC: increment_event_attendees
-- Increments the attendee count for an event (called after registration)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_event_attendees(event_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.events
  SET attendees = attendees + 1
  WHERE id = event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.increment_event_attendees(UUID) TO authenticated;

-- ============================================================================
-- RPC: decrement_event_attendees
-- Decrements the attendee count for an event (called after unregistration)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_event_attendees(event_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.events
  SET attendees = GREATEST(0, attendees - 1)
  WHERE id = event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.decrement_event_attendees(UUID) TO authenticated;

-- ============================================================================
-- END OF MIGRATION 003
-- ============================================================================
