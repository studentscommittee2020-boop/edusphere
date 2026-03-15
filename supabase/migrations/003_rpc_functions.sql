-- ============================================================================
-- EduSphere v2 -- Migration 003: RPC Functions & Schema Fixes
-- Target: Supabase (PostgreSQL 15+)
-- Project: ahqcjymeeifftcrglani
-- Created: 2026-03-15
-- ============================================================================

-- ============================================================================
-- FIX: orders table — add missing columns used by the service layer
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_email      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_name       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS order_notes     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS subtotal        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee    INTEGER NOT NULL DEFAULT 0;

-- Update the total to = subtotal + delivery_fee going forward
-- Existing rows have total = 0, which is fine (no real data yet)

COMMENT ON COLUMN public.orders.user_email    IS 'Denormalized email for order confirmation emails';
COMMENT ON COLUMN public.orders.full_name     IS 'Delivery contact full name';
COMMENT ON COLUMN public.orders.phone         IS 'Delivery contact phone number';
COMMENT ON COLUMN public.orders.city          IS 'Delivery city';
COMMENT ON COLUMN public.orders.order_notes   IS 'Additional notes from the student';
COMMENT ON COLUMN public.orders.subtotal      IS 'Sum of item prices before delivery fee';
COMMENT ON COLUMN public.orders.delivery_fee  IS 'Flat delivery fee';

-- ============================================================================
-- RPC: increment_event_attendees
-- Safely increments the attendees count for an event.
-- Called after a successful event_registrations INSERT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_event_attendees(event_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.events
  SET attendees = attendees + 1
  WHERE id = event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: decrement_event_attendees
-- Safely decrements the attendees count, flooring at 0.
-- Called after a successful event_registrations DELETE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_event_attendees(event_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.events
  SET attendees = GREATEST(0, attendees - 1)
  WHERE id = event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grants for RPC functions
GRANT EXECUTE ON FUNCTION public.increment_event_attendees(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_event_attendees(UUID) TO authenticated;

-- ============================================================================
-- TABLE: favorites
-- User bookmarks for exams, books, and events.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL
    CHECK (item_type IN ('previous_exam', 'entrance_exam', 'book', 'event')),
  item_id         UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);

COMMENT ON TABLE public.favorites IS 'User bookmarks for exams, books, and events.';

CREATE TRIGGER set_favorites_updated_at
  BEFORE UPDATE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_item_type ON public.favorites(item_type);
CREATE INDEX IF NOT EXISTS idx_favorites_user_item ON public.favorites(user_id, item_type);

-- RLS
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_select_own"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "favorites_insert_own"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "favorites_delete_own"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Grant
GRANT ALL ON public.favorites TO authenticated;

-- ============================================================================
-- RPC: get_dashboard_stats
-- Returns aggregate counts for the dashboard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_exams',         (SELECT COUNT(*) FROM public.previous_exams),
    'total_entrance_exams',(SELECT COUNT(*) FROM public.entrance_exams),
    'total_books',         (SELECT COUNT(*) FROM public.books),
    'total_events',        (SELECT COUNT(*) FROM public.events WHERE type = 'upcoming'),
    'total_courses',       (SELECT COUNT(*) FROM public.courses)
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO anon, authenticated;

-- ============================================================================
-- RPC: get_user_dashboard_stats
-- Returns personalized stats for the authenticated user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_dashboard_stats(
  p_major   TEXT DEFAULT NULL,
  p_semester TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'exams_for_major',
      CASE
        WHEN p_major IS NOT NULL THEN
          (SELECT COUNT(*) FROM public.previous_exams WHERE major = p_major)
        ELSE
          (SELECT COUNT(*) FROM public.previous_exams)
      END,
    'exams_for_semester',
      CASE
        WHEN p_major IS NOT NULL AND p_semester IS NOT NULL THEN
          (SELECT COUNT(*) FROM public.previous_exams WHERE major = p_major AND semester = p_semester)
        ELSE NULL
      END,
    'books_for_major',
      CASE
        WHEN p_major IS NOT NULL THEN
          (SELECT COUNT(*) FROM public.books WHERE major = p_major OR major = 'Common')
        ELSE
          (SELECT COUNT(*) FROM public.books)
      END,
    'upcoming_events',
      (SELECT COUNT(*) FROM public.events WHERE type = 'upcoming'),
    'user_favorites',
      CASE
        WHEN auth.uid() IS NOT NULL THEN
          (SELECT COUNT(*) FROM public.favorites WHERE user_id = auth.uid())
        ELSE 0
      END,
    'user_orders',
      CASE
        WHEN auth.uid() IS NOT NULL THEN
          (SELECT COUNT(*) FROM public.orders WHERE user_id = auth.uid())
        ELSE 0
      END
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_user_dashboard_stats(TEXT, TEXT) TO anon, authenticated;

-- ============================================================================
-- RPC: get_recommended_exams
-- Returns up to N exams filtered by major and semester, ordered by rating.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_recommended_exams(
  p_major     TEXT,
  p_semester  TEXT DEFAULT NULL,
  p_limit     INTEGER DEFAULT 8
)
RETURNS SETOF public.previous_exams AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.previous_exams
  WHERE major = p_major
    AND (p_semester IS NULL OR semester = p_semester)
  ORDER BY rating DESC, created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_recommended_exams(TEXT, TEXT, INTEGER) TO anon, authenticated;

-- ============================================================================
-- Update Database type hints: add is_admin to Functions
-- (No SQL change needed — just adds the RPC functions above)
-- ============================================================================

-- ============================================================================
-- END OF MIGRATION 003
-- ============================================================================
