-- ============================================================================
-- EduSphere v2 -- Create Favorites Table
-- Stores user favorites for exams, books, and events
-- Created: 2026-04-23
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL
    CHECK (item_type IN ('previous_exam', 'entrance_exam', 'book', 'event')),
  item_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, item_type, item_id)
);

COMMENT ON TABLE public.favorites IS 'User favorites for exams, books, and events.';

CREATE TRIGGER IF NOT EXISTS set_favorites_updated_at
  BEFORE UPDATE ON public.favorites
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_item_type ON public.favorites(item_type);
CREATE INDEX IF NOT EXISTS idx_favorites_user_item ON public.favorites(user_id, item_type);

-- Enable RLS
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Users can read their own favorites
CREATE POLICY IF NOT EXISTS "favorites_select_own"
  ON public.favorites FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all favorites
CREATE POLICY IF NOT EXISTS "favorites_select_admin"
  ON public.favorites FOR SELECT
  USING (public.is_admin());

-- Users can insert their own favorites
CREATE POLICY IF NOT EXISTS "favorites_insert_own"
  ON public.favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY IF NOT EXISTS "favorites_delete_own"
  ON public.favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can delete any favorite
CREATE POLICY IF NOT EXISTS "favorites_delete_admin"
  ON public.favorites FOR DELETE
  USING (public.is_admin());

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT SELECT ON public.favorites TO anon;

-- ============================================================================
-- END OF MIGRATION 007
-- ============================================================================
