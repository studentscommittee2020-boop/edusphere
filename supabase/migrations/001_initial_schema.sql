-- ============================================================================
-- EduSphere v2 -- Initial Database Schema
-- Target: Supabase (PostgreSQL 15+)
-- Project: ahqcjymeeifftcrglani
-- Created: 2026-03-13
-- ============================================================================

-- ── EXTENSIONS ──────────────────────────────────────────────────────────────
-- gen_random_uuid() is built-in from PostgreSQL 13+, no extension needed.

-- ── CUSTOM TYPES (as CHECK constraints for Supabase compatibility) ──────────
-- We use CHECK constraints instead of CREATE TYPE for easier migration and
-- compatibility with Supabase's schema diff tooling.

-- ============================================================================
-- 1. HELPER: updated_at trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. HELPER: auto-create profile on auth.users insert
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3. HELPER: check if current user is admin
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_emails
    WHERE email = auth.jwt() ->> 'email'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ============================================================================
-- TABLE: admin_emails
-- Allowlist of emails that grant admin access.
-- ============================================================================

CREATE TABLE public.admin_emails (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_admin_emails_updated_at
  BEFORE UPDATE ON public.admin_emails
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- TABLE: profiles
-- Extends auth.users with app-specific data.
-- ============================================================================

CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL DEFAULT '',
  avatar_url      TEXT DEFAULT '',
  language        TEXT NOT NULL DEFAULT 'fr'
    CHECK (language IN ('fr', 'en')),
  major           TEXT DEFAULT NULL
    CHECK (major IS NULL OR major IN ('Common', 'Audit & Accounting', 'Finance', 'Marketing', 'Management', 'MIS')),
  semester        TEXT DEFAULT NULL
    CHECK (semester IS NULL OR semester IN ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7', 'LS8', 'LS9')),
  track           TEXT DEFAULT NULL
    CHECK (track IS NULL OR track IN ('french', 'english')),
  role            TEXT NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'admin')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles extending Supabase auth.users.';

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX idx_profiles_major ON public.profiles(major);
CREATE INDEX idx_profiles_semester ON public.profiles(semester);
CREATE INDEX idx_profiles_track ON public.profiles(track);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ============================================================================
-- TABLE: courses
-- Bilingual course catalog organized by major/semester.
-- ============================================================================

CREATE TABLE public.courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE,                          -- short code like 'fc1', 'ea5'
  title       TEXT NOT NULL,                        -- English title
  title_fr    TEXT NOT NULL,                        -- French title
  credits     NUMERIC(3,1) NOT NULL DEFAULT 0
    CHECK (credits >= 0),
  semester    TEXT NOT NULL
    CHECK (semester IN ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7', 'LS8', 'LS9')),
  major       TEXT NOT NULL
    CHECK (major IN ('Common', 'Audit & Accounting', 'Finance', 'Marketing', 'Management', 'MIS')),
  type        TEXT NOT NULL DEFAULT 'common'
    CHECK (type IN ('common', 'major')),
  track       TEXT NOT NULL DEFAULT 'french'
    CHECK (track IN ('french', 'english')),
  description TEXT DEFAULT '',
  description_fr TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.courses IS 'Bilingual course catalog for FSEG 2.';

CREATE TRIGGER set_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for common filter patterns
CREATE INDEX idx_courses_semester ON public.courses(semester);
CREATE INDEX idx_courses_major ON public.courses(major);
CREATE INDEX idx_courses_track ON public.courses(track);
CREATE INDEX idx_courses_type ON public.courses(type);
CREATE INDEX idx_courses_major_semester ON public.courses(major, semester);
CREATE INDEX idx_courses_track_semester ON public.courses(track, semester);

-- ============================================================================
-- TABLE: previous_exams
-- Archive of past exam papers with file storage.
-- ============================================================================

CREATE TABLE public.previous_exams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  course_title    TEXT NOT NULL,               -- denormalized for display perf
  course_title_fr TEXT NOT NULL,               -- denormalized for display perf
  major           TEXT NOT NULL
    CHECK (major IN ('Common', 'Audit & Accounting', 'Finance', 'Marketing', 'Management', 'MIS')),
  semester        TEXT NOT NULL
    CHECK (semester IN ('LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7', 'LS8', 'LS9')),
  year            TEXT NOT NULL,               -- e.g. '2024'
  exam_type       TEXT NOT NULL
    CHECK (exam_type IN ('midterms', 'final', 'resit')),
  pages           INTEGER NOT NULL DEFAULT 1
    CHECK (pages > 0),
  rating          NUMERIC(2,1) NOT NULL DEFAULT 0
    CHECK (rating >= 0 AND rating <= 5),
  track           TEXT NOT NULL DEFAULT 'french'
    CHECK (track IN ('french', 'english')),
  file_url        TEXT DEFAULT NULL,           -- Supabase Storage path
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.previous_exams IS 'Archive of past exam papers, filterable by major/semester/year/type.';

CREATE TRIGGER set_previous_exams_updated_at
  BEFORE UPDATE ON public.previous_exams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for filter patterns
CREATE INDEX idx_previous_exams_course_id ON public.previous_exams(course_id);
CREATE INDEX idx_previous_exams_major ON public.previous_exams(major);
CREATE INDEX idx_previous_exams_semester ON public.previous_exams(semester);
CREATE INDEX idx_previous_exams_year ON public.previous_exams(year);
CREATE INDEX idx_previous_exams_exam_type ON public.previous_exams(exam_type);
CREATE INDEX idx_previous_exams_track ON public.previous_exams(track);
CREATE INDEX idx_previous_exams_major_semester ON public.previous_exams(major, semester);

-- ============================================================================
-- TABLE: entrance_exams
-- Entrance exam papers with difficulty levels.
-- ============================================================================

CREATE TABLE public.entrance_exams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  title_fr        TEXT NOT NULL,
  subject         TEXT NOT NULL,               -- e.g. 'French', 'Math', 'Economics', 'English'
  exam_lang       TEXT NOT NULL DEFAULT 'French',
  year            TEXT NOT NULL,
  difficulty      TEXT NOT NULL DEFAULT 'Medium'
    CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  pages           INTEGER NOT NULL DEFAULT 1
    CHECK (pages > 0),
  rating          NUMERIC(2,1) NOT NULL DEFAULT 0
    CHECK (rating >= 0 AND rating <= 5),
  description     TEXT DEFAULT '',
  description_fr  TEXT DEFAULT '',
  file_url        TEXT DEFAULT NULL,           -- Supabase Storage path
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.entrance_exams IS 'Entrance exam papers with bilingual descriptions and difficulty levels.';

CREATE TRIGGER set_entrance_exams_updated_at
  BEFORE UPDATE ON public.entrance_exams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_entrance_exams_subject ON public.entrance_exams(subject);
CREATE INDEX idx_entrance_exams_year ON public.entrance_exams(year);
CREATE INDEX idx_entrance_exams_difficulty ON public.entrance_exams(difficulty);
CREATE INDEX idx_entrance_exams_exam_lang ON public.entrance_exams(exam_lang);

-- ============================================================================
-- TABLE: books
-- Textbook catalog with pricing, ratings, and stock status.
-- ============================================================================

CREATE TABLE public.books (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  title_fr        TEXT NOT NULL,
  author          TEXT NOT NULL,
  price           INTEGER NOT NULL DEFAULT 0
    CHECK (price >= 0),                        -- price in LBP (integer, no cents)
  rating          NUMERIC(2,1) NOT NULL DEFAULT 0
    CHECK (rating >= 0 AND rating <= 5),
  major           TEXT NOT NULL
    CHECK (major IN ('Common', 'Audit & Accounting', 'Finance', 'Marketing', 'Management', 'MIS')),
  semesters       TEXT NOT NULL DEFAULT '',     -- comma-separated: 'LS1, LS2'
  in_stock        BOOLEAN NOT NULL DEFAULT TRUE,
  related_courses TEXT[] DEFAULT '{}',         -- array of course codes
  track           TEXT NOT NULL DEFAULT 'both'
    CHECK (track IN ('french', 'english', 'both')),
  cover_image_url TEXT DEFAULT NULL,           -- Supabase Storage path
  description     TEXT DEFAULT '',
  description_fr  TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.books IS 'Textbook catalog with bilingual titles, pricing, and stock status.';

CREATE TRIGGER set_books_updated_at
  BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_books_major ON public.books(major);
CREATE INDEX idx_books_track ON public.books(track);
CREATE INDEX idx_books_in_stock ON public.books(in_stock);
CREATE INDEX idx_books_major_track ON public.books(major, track);

-- ============================================================================
-- TABLE: events
-- Campus events with RSVP tracking.
-- ============================================================================

CREATE TABLE public.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  date            TEXT NOT NULL,                -- human-readable: 'March 25, 2025'
  time            TEXT NOT NULL DEFAULT '',     -- e.g. '9:00 AM - 5:00 PM'
  location        TEXT NOT NULL DEFAULT '',
  attendees       INTEGER NOT NULL DEFAULT 0
    CHECK (attendees >= 0),
  tag             TEXT NOT NULL DEFAULT 'Academic',
  description     TEXT DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (type IN ('upcoming', 'past')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.events IS 'Campus events with metadata for RSVP and display.';

CREATE TRIGGER set_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_events_type ON public.events(type);
CREATE INDEX idx_events_tag ON public.events(tag);
CREATE INDEX idx_events_date ON public.events(date);

-- ============================================================================
-- TABLE: event_registrations
-- User RSVP to events (junction table).
-- ============================================================================

CREATE TABLE public.event_registrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

COMMENT ON TABLE public.event_registrations IS 'User RSVP registrations for campus events.';

CREATE TRIGGER set_event_registrations_updated_at
  BEFORE UPDATE ON public.event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_event_registrations_user_id ON public.event_registrations(user_id);
CREATE INDEX idx_event_registrations_event_id ON public.event_registrations(event_id);

-- ============================================================================
-- TABLE: cart_items
-- Shopping cart for books (per user).
-- ============================================================================

CREATE TABLE public.cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1
    CHECK (quantity > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

COMMENT ON TABLE public.cart_items IS 'Per-user shopping cart for book orders.';

CREATE TRIGGER set_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_cart_items_user_id ON public.cart_items(user_id);
CREATE INDEX idx_cart_items_book_id ON public.cart_items(book_id);

-- ============================================================================
-- TABLE: orders
-- Book orders placed by users.
-- ============================================================================

CREATE TABLE public.orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  total           INTEGER NOT NULL DEFAULT 0
    CHECK (total >= 0),
  delivery_name   TEXT DEFAULT '',
  delivery_phone  TEXT DEFAULT '',
  delivery_address TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.orders IS 'Book orders placed by students.';

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

-- ============================================================================
-- TABLE: order_items
-- Individual line items within an order.
-- ============================================================================

CREATE TABLE public.order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  book_id     UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL DEFAULT 1
    CHECK (quantity > 0),
  unit_price  INTEGER NOT NULL DEFAULT 0
    CHECK (unit_price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.order_items IS 'Individual book items within an order.';

CREATE TRIGGER set_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Indexes
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_book_id ON public.order_items(book_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previous_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entrance_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ── admin_emails ────────────────────────────────────────────────────────────

-- Only admins can read the admin email list (for admin panel display)
CREATE POLICY "admin_emails_select_admin"
  ON public.admin_emails FOR SELECT
  USING (public.is_admin());

-- Only admins can manage admin emails
CREATE POLICY "admin_emails_insert_admin"
  ON public.admin_emails FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_emails_update_admin"
  ON public.admin_emails FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "admin_emails_delete_admin"
  ON public.admin_emails FOR DELETE
  USING (public.is_admin());

-- ── profiles ────────────────────────────────────────────────────────────────

-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profile insert is handled by the trigger (SECURITY DEFINER), but allow
-- the user to insert their own row as a fallback
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ── courses (public read, admin write) ──────────────────────────────────────

CREATE POLICY "courses_select_public"
  ON public.courses FOR SELECT
  USING (TRUE);

CREATE POLICY "courses_insert_admin"
  ON public.courses FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "courses_update_admin"
  ON public.courses FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "courses_delete_admin"
  ON public.courses FOR DELETE
  USING (public.is_admin());

-- ── previous_exams (public read, admin write) ───────────────────────────────

CREATE POLICY "previous_exams_select_public"
  ON public.previous_exams FOR SELECT
  USING (TRUE);

CREATE POLICY "previous_exams_insert_admin"
  ON public.previous_exams FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "previous_exams_update_admin"
  ON public.previous_exams FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "previous_exams_delete_admin"
  ON public.previous_exams FOR DELETE
  USING (public.is_admin());

-- ── entrance_exams (public read, admin write) ───────────────────────────────

CREATE POLICY "entrance_exams_select_public"
  ON public.entrance_exams FOR SELECT
  USING (TRUE);

CREATE POLICY "entrance_exams_insert_admin"
  ON public.entrance_exams FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "entrance_exams_update_admin"
  ON public.entrance_exams FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "entrance_exams_delete_admin"
  ON public.entrance_exams FOR DELETE
  USING (public.is_admin());

-- ── books (public read, admin write) ────────────────────────────────────────

CREATE POLICY "books_select_public"
  ON public.books FOR SELECT
  USING (TRUE);

CREATE POLICY "books_insert_admin"
  ON public.books FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "books_update_admin"
  ON public.books FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "books_delete_admin"
  ON public.books FOR DELETE
  USING (public.is_admin());

-- ── events (public read, admin write) ───────────────────────────────────────

CREATE POLICY "events_select_public"
  ON public.events FOR SELECT
  USING (TRUE);

CREATE POLICY "events_insert_admin"
  ON public.events FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "events_update_admin"
  ON public.events FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "events_delete_admin"
  ON public.events FOR DELETE
  USING (public.is_admin());

-- ── event_registrations (authenticated own + admin) ─────────────────────────

CREATE POLICY "event_registrations_select_own"
  ON public.event_registrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "event_registrations_select_admin"
  ON public.event_registrations FOR SELECT
  USING (public.is_admin());

CREATE POLICY "event_registrations_insert_own"
  ON public.event_registrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_registrations_delete_own"
  ON public.event_registrations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "event_registrations_delete_admin"
  ON public.event_registrations FOR DELETE
  USING (public.is_admin());

-- ── cart_items (authenticated own only) ─────────────────────────────────────

CREATE POLICY "cart_items_select_own"
  ON public.cart_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "cart_items_insert_own"
  ON public.cart_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cart_items_update_own"
  ON public.cart_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cart_items_delete_own"
  ON public.cart_items FOR DELETE
  USING (auth.uid() = user_id);

-- ── orders (own read/insert, admin all) ─────────────────────────────────────

CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "orders_select_admin"
  ON public.orders FOR SELECT
  USING (public.is_admin());

CREATE POLICY "orders_insert_own"
  ON public.orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders_update_admin"
  ON public.orders FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "orders_delete_admin"
  ON public.orders FOR DELETE
  USING (public.is_admin());

-- ── order_items (own read via order, admin all) ─────────────────────────────

CREATE POLICY "order_items_select_own"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_select_admin"
  ON public.order_items FOR SELECT
  USING (public.is_admin());

CREATE POLICY "order_items_insert_own"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_update_admin"
  ON public.order_items FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "order_items_delete_admin"
  ON public.order_items FOR DELETE
  USING (public.is_admin());

-- ============================================================================
-- STORAGE BUCKETS
-- Note: These are created via Supabase Storage API. The SQL below uses the
-- storage schema which is available in Supabase-hosted PostgreSQL.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('exam-papers', 'exam-papers', TRUE),
  ('book-covers', 'book-covers', TRUE),
  ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: exam-papers (public read, admin upload)
CREATE POLICY "exam_papers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-papers');

CREATE POLICY "exam_papers_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exam-papers' AND public.is_admin());

CREATE POLICY "exam_papers_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'exam-papers' AND public.is_admin());

CREATE POLICY "exam_papers_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exam-papers' AND public.is_admin());

-- Storage policies: book-covers (public read, admin upload)
CREATE POLICY "book_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'book-covers');

CREATE POLICY "book_covers_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'book-covers' AND public.is_admin());

CREATE POLICY "book_covers_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'book-covers' AND public.is_admin());

CREATE POLICY "book_covers_admin_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'book-covers' AND public.is_admin());

-- Storage policies: avatars (own read/write, public read)
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_user_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_user_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "avatars_user_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- ============================================================================
-- GRANTS
-- Supabase uses anon and authenticated roles for API access.
-- ============================================================================

-- Public (anon) can read catalog tables
GRANT SELECT ON public.courses TO anon;
GRANT SELECT ON public.previous_exams TO anon;
GRANT SELECT ON public.entrance_exams TO anon;
GRANT SELECT ON public.books TO anon;
GRANT SELECT ON public.events TO anon;

-- Authenticated users get full access (RLS handles row-level restrictions)
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.courses TO authenticated;
GRANT ALL ON public.previous_exams TO authenticated;
GRANT ALL ON public.entrance_exams TO authenticated;
GRANT ALL ON public.books TO authenticated;
GRANT ALL ON public.events TO authenticated;
GRANT ALL ON public.event_registrations TO authenticated;
GRANT ALL ON public.cart_items TO authenticated;
GRANT ALL ON public.orders TO authenticated;
GRANT ALL ON public.order_items TO authenticated;
GRANT ALL ON public.admin_emails TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_updated_at() TO authenticated;

-- ============================================================================
-- END OF MIGRATION 001
-- ============================================================================
