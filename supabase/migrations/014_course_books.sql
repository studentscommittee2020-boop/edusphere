-- EduSphere v2 — migration 014
--
-- Adds:
--   1. Course books — the Student Council uploads textbook files (PDF or
--      PowerPoint) for a course; a course may have MULTIPLE books. Doctors
--      teaching that course review a pending book and either CONFIRM it or
--      REJECT it and upload a replacement, which goes back to the council as
--      pending until the council confirms it. Full lifecycle in section 1.
--   2. Doctor book selection — doctor_courses (012) gains a nullable
--      selected_book_id, so two doctors teaching the same course/track/
--      semester can each use a DIFFERENT confirmed book without the council
--      ever uploading the same file twice.
--   3. A dedicated, private storage bucket for book files — council,
--      the doctor(s) teaching that book's course, admin and owner only.
--      Students never get a read policy on it, at the RLS layer AND the
--      storage layer, not just hidden in the UI.
--   4. Instructor attribution — schedule_entries (009) gains a nullable
--      instructor_id, plus a staff-maintained instructor_aliases table that
--      is the ONLY mechanism allowed to resolve the university's free-text
--      instructor name into a doctor's profiles.id. No fuzzy matching, ever:
--      an unresolved name stays NULL and is counted, visibly, as
--      "unattributed" rather than silently dropped.
--   5. Print-count visibility — course_book_print_counts and
--      course_unattributed_students, two views the council uses to decide
--      how many copies to print without ever trusting a silently-low number.
--   6. Council write-audit coverage — previous_exams/entrance_exams/events
--      never received an audit_portal_change() trigger in 001-013 (only the
--      owner-only audit_owner_write_<table> trigger from grant_owner_full_
--      access()). 012 gave committee_admin full CRUD on all three, so a
--      non-owner council write to the archive has been going completely
--      unlogged since 012 shipped. Section 6 closes that gap for those three
--      tables; course_books gets the same trigger from day one in section 1.
--
-- Runs after 001-013: profiles, courses, previous_exams, entrance_exams,
-- events, doctor_courses, schedule_entries, audit_logs, is_admin(),
-- is_owner(), is_doctor(), is_committee_admin(), is_target_role(),
-- effective_user_id(), handle_updated_at(), audit_portal_change(),
-- grant_owner_full_access() already exist. Nothing here redefines their
-- existing behaviour — every function this file touches is either brand new
-- or attached to a table via CREATE TRIGGER only (never CREATE OR REPLACEd).
--
-- Conventions follow 009/011/012/013: SECURITY DEFINER + STABLE + `SET
-- search_path` on predicate helpers, REVOKE-then-GRANT on every function that
-- must not be callable by anon, explicit table-level GRANT for every
-- RLS-enabled table (009's postmortem: RLS without a table GRANT makes every
-- policy unreachable — Postgres checks the base privilege first), no
-- `WITH CHECK (TRUE)` anywhere, grant_owner_full_access() applied to every
-- new mutable table, doctor-scoped permissions keyed off doctor_courses (not
-- "any doctor"), and the ACTOR/PERMISSION split introduced in 012: a
-- SECURITY DEFINER RPC's permission check (may this REAL caller invoke this
-- at all?) always reads auth.uid()/is_doctor()/is_committee_admin()/
-- is_admin() directly; the row it writes is ATTRIBUTED to
-- effective_user_id() (the impersonation target if the owner is "acting as"
-- someone, otherwise auth.uid() itself — a no-op for every normal call).
--
-- UNVERIFIED: this file has not been run against a database. No local
-- Supabase, no staging, no psql. Every FK target, constraint name, function
-- signature and policy below was hand-checked against 001-013 by reading the
-- files directly, and a bracket/dollar-quote/quote balance check was run over
-- this file as a plain-text sanity check (see the accompanying report). That
-- is not the same as executing it. A `supabase db reset` dry run against a
-- local or branch database is required before this goes anywhere near
-- production.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. COURSE BOOKS — table + review lifecycle
-- ═══════════════════════════════════════════════════════════════════════════
-- STATE MACHINE (course_books.status):
--
--   pending_doctor_review  -- council just uploaded (upload_course_book()).
--     │                       Any doctor who teaches this book's course
--     │                       (EXISTS in doctor_courses, per-brief "keyed off
--     │                       doctor_courses, not any doctor") may act.
--     ├─ confirm_course_book() ──────────────────────────────► confirmed
--     └─ reject_course_book() + REQUIRED replacement file ───► pending_council_review
--                                                                (new row;
--                                                                 old row →
--                                                                 rejected,
--                                                                 terminal)
--
--   pending_council_review -- a doctor's replacement, awaiting the council
--     │                       (committee_admin/admin) who bears the printing
--     │                       cost and must sign off before it is usable.
--     ├─ confirm_course_book() ──────────────────────────────► confirmed
--     └─ reject_course_book() + OPTIONAL replacement file
--          ├─ replacement supplied  ───────────────────────► pending_doctor_review (new row)
--          └─ no replacement        ───────────────────────► (old row stays rejected,
--                                                              terminal; council calls
--                                                              upload_course_book() fresh
--                                                              when ready)
--
--   confirmed   -- terminal-ish: selectable by any doctor teaching the course
--                  (select_course_book()) and countable in
--                  course_book_print_counts. There is deliberately NO path
--                  back from confirmed to any other state in this migration
--                  — see the design-risk note below the RPCs.
--   rejected    -- always terminal for THIS row. A rejection's replacement
--                  file is a NEW course_books row (replaces_book_id links
--                  back), never a mutation of the rejected row, so the
--                  original file + rejection reason stay intact as history.
--
-- DESIGN RISK, flagged rather than silently resolved: review is BOOK-level,
-- not per-doctor. The first doctor teaching a course to confirm or reject a
-- pending book decides for every doctor who might later select it — there is
-- no mechanism here for a second doctor to dispute a book their colleague
-- already confirmed. The brief's "central requirement" is that SELECTION is
-- per-doctor (two doctors may use different books), not that REVIEW is
-- per-doctor, and the brief never asks for multi-doctor sign-off on one
-- book, so this migration does not build it. If that turns out to be wrong,
-- it needs a join table (book_id, doctor_id, decision) instead of the single
-- status column here — a bigger change than this migration's brief covers.
-- Likewise there is no "un-confirm" path if a problem is found in a book
-- after confirmation; that would need a new status transition this migration
-- deliberately does not invent.

CREATE TABLE public.course_books (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  -- Denormalised at upload time, same pattern as previous_exams/
  -- exam_submissions (012) — display perf, and survives a course rename.
  course_title     TEXT NOT NULL,
  course_title_fr  TEXT NOT NULL,
  title            TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  -- The council member (or the rejecting doctor, for a replacement row) who
  -- uploaded THIS specific file. Actor-attributed via effective_user_id() in
  -- every RPC below, never auth.uid() directly — see the header comment.
  uploaded_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path     TEXT NOT NULL UNIQUE,
  original_name    TEXT NOT NULL,
  -- PDF or PowerPoint only — task requirement #5. Repeated verbatim (not a
  -- shared CREATE TYPE — 001's stated convention is CHECK constraints, not
  -- custom types, for Supabase schema-diff compatibility) in
  -- upload_course_book() and reject_course_book() below; keep all three in
  -- sync if this list ever changes.
  mime_type        TEXT NOT NULL CHECK (mime_type IN (
                      'application/pdf',
                      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                      'application/vnd.ms-powerpoint'
                    )),
  -- 150 MB, not the 25 MB used elsewhere in this codebase for a single exam
  -- paper or assignment attachment: a full scanned/searchable textbook, or a
  -- media-heavy slide deck standing in for one, is routinely far larger than
  -- a single exam paper. 150 MB comfortably fits a multi-hundred-page PDF or
  -- a heavy PPTX without opening the door to unbounded storage abuse.
  size_bytes       BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 157286400),
  status           TEXT NOT NULL DEFAULT 'pending_doctor_review'
    CHECK (status IN ('pending_doctor_review', 'pending_council_review', 'confirmed', 'rejected')),
  -- Self-referential lineage: a rejected book's replacement points back to
  -- it, so the review history (who rejected what, and why) survives even
  -- though the two are separate rows. ON DELETE SET NULL: deleting an old
  -- rejected row (owner-only, see RLS below) should not be blocked by, or
  -- cascade into, a newer row that replaced it.
  replaces_book_id UUID REFERENCES public.course_books(id) ON DELETE SET NULL,
  reviewed_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  rejection_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(rejection_reason) <= 2000),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (reviewed_at IS NULL OR status IN ('confirmed', 'rejected')),
  CHECK (status <> 'rejected' OR char_length(btrim(rejection_reason)) > 0)
  -- Deliberately NOT also enforcing "replaces_book_id IS NOT NULL when this
  -- row was created by a rejection" as a table CHECK: same reasoning as
  -- exam_submissions.approved_exam_id in 012 — replaces_book_id's own
  -- ON DELETE SET NULL would fight a CHECK requiring it to be non-null the
  -- moment the referenced row is deleted. Enforced procedurally instead, by
  -- reject_course_book() always setting it in the same INSERT.
);

COMMENT ON TABLE public.course_books IS
  'Textbook files for a course (PDF/PPT/PPTX), uploaded by the Student Council and reviewed by the doctor(s) teaching that course. A course may have multiple books; see doctor_courses.selected_book_id for which one each doctor actually uses. Never readable by students — see the RLS policy and storage policy below, both independent of the UI.';

CREATE TRIGGER set_course_books_updated_at
  BEFORE UPDATE ON public.course_books
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Same shape as 012's audit_exam_submissions_change: course_books has an
-- explicit review workflow (status/title both already captured by
-- audit_portal_change()'s existing hardcoded metadata keys), so it gets the
-- full audit trigger from day one — unlike instructor_aliases below, which
-- is plain staff-maintained CRUD with no review workflow and follows
-- doctor_courses'/review_account_roles' precedent of no audit_portal_change
-- trigger, owner-only via grant_owner_full_access().
CREATE TRIGGER audit_course_books_change
  AFTER INSERT OR UPDATE OR DELETE ON public.course_books
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE INDEX idx_course_books_course_status ON public.course_books(course_id, status);
CREATE INDEX idx_course_books_replaces ON public.course_books(replaces_book_id);

-- Storage-policy predicate, same shape as 008's can_read_print_file()/
-- can_read_assignment_attachment() and 012's can_read_exam_submission().
-- "Assigned doctor" here means "teaches the book's course at all" (any
-- doctor_courses row for that course_id), not "has this exact book
-- selected" — a doctor must be able to read a still-pending candidate book
-- to review it before they can select anything, so gating read access to
-- selected_book_id would make review impossible. This is the same looseness
-- 012 already accepted for assignments_insert_doctor (course-level, not
-- year/semester-scoped) and is flagged there, not newly introduced here.
CREATE OR REPLACE FUNCTION public.can_read_course_book(p_storage_path TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_books book
    WHERE book.storage_path = p_storage_path
      AND (
        public.is_admin()
        OR public.is_committee_admin()
        OR EXISTS (
          SELECT 1 FROM public.doctor_courses dc
          WHERE dc.doctor_id = auth.uid() AND dc.course_id = book.course_id
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Council's initial upload for a course. The ONLY way a course_books row
-- reaches status = 'pending_doctor_review' as a brand-new book (as opposed
-- to a replacement minted by reject_course_book() below).
CREATE OR REPLACE FUNCTION public.upload_course_book(
  p_course_id     UUID,
  p_title         TEXT,
  p_storage_path  TEXT,
  p_original_name TEXT,
  p_mime_type     TEXT,
  p_size_bytes    BIGINT
)
RETURNS public.course_books AS $$
DECLARE
  course_record public.courses;
  v_actor_id    UUID := public.effective_user_id();
  v_book        public.course_books;
BEGIN
  -- PERMISSION: real caller. is_admin()/is_committee_admin() already return
  -- TRUE for the owner unconditionally, which is what lets an impersonating
  -- owner reach this function at all.
  IF NOT (public.is_committee_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Only the committee or an admin may upload a course book';
  END IF;

  -- ELIGIBILITY: the acting identity must actually hold council/admin
  -- standing — catches an owner impersonating a plain doctor/student here,
  -- which the PERMISSION check above cannot (always true for the owner).
  -- is_target_role(v_actor_id, 'admin') checks profiles.role, not
  -- admin_emails — a target whose real admin status comes ONLY from
  -- admin_emails (not profiles.role = 'admin') would fail this check even
  -- though they are a genuine admin. Narrow, accepted imprecision: this is
  -- the same is_target_role() introduced in 012, which never needed an
  -- 'admin' target check before; the real caller's PERMISSION check above
  -- (is_admin(), which DOES read admin_emails correctly) is what actually
  -- protects this endpoint, so a false-negative here only ever blocks a
  -- legitimate impersonated action, never lets an illegitimate one through.
  IF NOT (public.is_target_role(v_actor_id, 'committee_admin') OR public.is_target_role(v_actor_id, 'admin')) THEN
    RAISE EXCEPTION 'The acting user is not authorized to upload on behalf of the council';
  END IF;

  SELECT * INTO course_record FROM public.courses WHERE id = p_course_id;
  IF course_record.id IS NULL THEN
    RAISE EXCEPTION 'Unknown course';
  END IF;

  IF p_title IS NULL OR char_length(btrim(p_title)) < 2 THEN
    RAISE EXCEPTION 'A book title is required';
  END IF;

  -- Keep in sync with course_books.mime_type CHECK and
  -- reject_course_book() below.
  IF p_mime_type NOT IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ) THEN
    RAISE EXCEPTION 'Only PDF or PowerPoint files are accepted';
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 157286400 THEN
    RAISE EXCEPTION 'File size is invalid';
  END IF;

  -- PERMISSION (storage): left on auth.uid(), not v_actor_id — the upload
  -- bucket policy below still keys the path to the real caller's folder, so
  -- requiring v_actor_id here would reject every impersonated upload
  -- outright. Same reasoning as submit_exam_for_review() (012).
  IF p_storage_path NOT LIKE auth.uid()::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid storage path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'course-books' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  INSERT INTO public.course_books (
    course_id, course_title, course_title_fr, title, uploaded_by,
    storage_path, original_name, mime_type, size_bytes, status
  ) VALUES (
    p_course_id, course_record.title, course_record.title_fr, btrim(p_title),
    v_actor_id, p_storage_path, p_original_name, p_mime_type, p_size_bytes,
    'pending_doctor_review'
  )
  RETURNING * INTO v_book;

  RETURN v_book;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

-- Confirms a book at whichever review point it currently sits at. Handles
-- BOTH halves of the state machine (doctor confirming the council's
-- original upload, or council confirming a doctor's replacement) — WHO may
-- call it successfully is entirely determined by the row's current status,
-- checked below.
CREATE OR REPLACE FUNCTION public.confirm_course_book(p_book_id UUID)
RETURNS public.course_books AS $$
DECLARE
  v_book     public.course_books;
  v_actor_id UUID := public.effective_user_id();
BEGIN
  SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id FOR UPDATE;
  IF v_book.id IS NULL THEN
    RAISE EXCEPTION 'Unknown book';
  END IF;

  IF v_book.status = 'pending_doctor_review' THEN
    IF NOT public.is_doctor() THEN
      RAISE EXCEPTION 'Only a doctor teaching this course may confirm this book';
    END IF;
    IF NOT public.is_target_role(v_actor_id, 'doctor') THEN
      RAISE EXCEPTION 'The acting user is not a doctor';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_courses
      WHERE doctor_id = v_actor_id AND course_id = v_book.course_id
    ) THEN
      RAISE EXCEPTION 'You do not teach this course';
    END IF;
  ELSIF v_book.status = 'pending_council_review' THEN
    IF NOT (public.is_committee_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'Only the committee or an admin may confirm this replacement';
    END IF;
    IF NOT (public.is_target_role(v_actor_id, 'committee_admin') OR public.is_target_role(v_actor_id, 'admin')) THEN
      RAISE EXCEPTION 'The acting user is not authorized to confirm on behalf of the council';
    END IF;
  ELSE
    RAISE EXCEPTION 'This book is not awaiting review';
  END IF;

  UPDATE public.course_books
  SET status = 'confirmed', reviewed_by = v_actor_id, reviewed_at = NOW()
  WHERE id = p_book_id
  RETURNING * INTO v_book;

  RETURN v_book;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Rejects a book at whichever review point it currently sits at, mirroring
-- confirm_course_book()'s status-driven branching. A doctor rejecting a
-- council upload MUST supply a replacement in the same call (task
-- requirement #3: reject + reupload is one atomic action). A council member
-- rejecting a doctor's replacement MAY supply a fresh replacement
-- immediately (kicks it back to pending_doctor_review) or leave it rejected
-- and terminal, handling the re-upload later via a fresh
-- upload_course_book() call — the brief only describes the doctor-reject
-- direction explicitly, so the council-reject direction is built
-- symmetrically rather than left as a dead end, and documented here rather
-- than silently assumed.
CREATE OR REPLACE FUNCTION public.reject_course_book(
  p_book_id                    UUID,
  p_rejection_reason           TEXT,
  p_replacement_storage_path   TEXT DEFAULT NULL,
  p_replacement_original_name  TEXT DEFAULT NULL,
  p_replacement_mime_type      TEXT DEFAULT NULL,
  p_replacement_size_bytes     BIGINT DEFAULT NULL
)
RETURNS public.course_books AS $$
DECLARE
  v_book       public.course_books;
  v_actor_id   UUID := public.effective_user_id();
  v_new_status TEXT;
  v_new_book   public.course_books;
BEGIN
  IF p_rejection_reason IS NULL OR char_length(btrim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id FOR UPDATE;
  IF v_book.id IS NULL THEN
    RAISE EXCEPTION 'Unknown book';
  END IF;

  IF v_book.status = 'pending_doctor_review' THEN
    IF NOT public.is_doctor() THEN
      RAISE EXCEPTION 'Only a doctor teaching this course may reject this book';
    END IF;
    IF NOT public.is_target_role(v_actor_id, 'doctor') THEN
      RAISE EXCEPTION 'The acting user is not a doctor';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.doctor_courses
      WHERE doctor_id = v_actor_id AND course_id = v_book.course_id
    ) THEN
      RAISE EXCEPTION 'You do not teach this course';
    END IF;
    IF p_replacement_storage_path IS NULL OR p_replacement_original_name IS NULL
       OR p_replacement_mime_type IS NULL OR p_replacement_size_bytes IS NULL THEN
      RAISE EXCEPTION 'A replacement file is required when a doctor rejects a book';
    END IF;
    v_new_status := 'pending_council_review';
  ELSIF v_book.status = 'pending_council_review' THEN
    IF NOT (public.is_committee_admin() OR public.is_admin()) THEN
      RAISE EXCEPTION 'Only the committee or an admin may reject this replacement';
    END IF;
    IF NOT (public.is_target_role(v_actor_id, 'committee_admin') OR public.is_target_role(v_actor_id, 'admin')) THEN
      RAISE EXCEPTION 'The acting user is not authorized to reject on behalf of the council';
    END IF;
    -- Council rejecting: replacement is optional — see the header comment
    -- on this function.
    v_new_status := 'pending_doctor_review';
  ELSE
    RAISE EXCEPTION 'This book is not awaiting review';
  END IF;

  UPDATE public.course_books
  SET status = 'rejected', reviewed_by = v_actor_id, reviewed_at = NOW(),
      rejection_reason = btrim(p_rejection_reason)
  WHERE id = p_book_id;

  IF p_replacement_storage_path IS NULL THEN
    -- Council rejected without an immediate replacement: return the
    -- now-rejected row as-is. (A doctor reaching this branch already raised
    -- above, so this path is council-only.)
    SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id;
    RETURN v_book;
  END IF;

  -- Keep in sync with course_books.mime_type CHECK and
  -- upload_course_book() above.
  IF p_replacement_mime_type NOT IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint'
  ) THEN
    RAISE EXCEPTION 'Only PDF or PowerPoint files are accepted';
  END IF;

  IF p_replacement_size_bytes <= 0 OR p_replacement_size_bytes > 157286400 THEN
    RAISE EXCEPTION 'Replacement file size is invalid';
  END IF;

  -- PERMISSION (storage): left on auth.uid(), not v_actor_id — same
  -- reasoning as upload_course_book() above.
  IF p_replacement_storage_path NOT LIKE auth.uid()::TEXT || '/%' THEN
    RAISE EXCEPTION 'Invalid replacement storage path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'course-books' AND name = p_replacement_storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded replacement file was not found';
  END IF;

  INSERT INTO public.course_books (
    course_id, course_title, course_title_fr, title, uploaded_by,
    storage_path, original_name, mime_type, size_bytes, status, replaces_book_id
  ) VALUES (
    v_book.course_id, v_book.course_title, v_book.course_title_fr, v_book.title,
    v_actor_id, p_replacement_storage_path, p_replacement_original_name,
    p_replacement_mime_type, p_replacement_size_bytes, v_new_status, v_book.id
  )
  RETURNING * INTO v_new_book;

  RETURN v_new_book;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

ALTER TABLE public.course_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_books_select_council_or_teaching_doctor"
  ON public.course_books FOR SELECT
  USING (
    public.is_admin()
    OR public.is_committee_admin()
    OR EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = course_books.course_id
    )
  );

-- No INSERT policy: upload_course_book()/reject_course_book() (both
-- SECURITY DEFINER) are the only write paths that create a row — exactly
-- like 012's exam_submissions.
--
-- UPDATE policy: attempting an UPDATE is gated here; WHAT actually changes
-- (status/reviewed_by/reviewed_at/rejection_reason) only ever happens inside
-- confirm_course_book()/reject_course_book() above. Same "who can invoke and
-- have their UPDATE land" framing 012 used for
-- exam_submissions_update_committee_or_admin.
CREATE POLICY "course_books_update_council_or_teaching_doctor"
  ON public.course_books FOR UPDATE
  USING (
    public.is_admin()
    OR public.is_committee_admin()
    OR EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = course_books.course_id
    )
  )
  WITH CHECK (
    public.is_admin()
    OR public.is_committee_admin()
    OR EXISTS (
      SELECT 1 FROM public.doctor_courses dc
      WHERE dc.doctor_id = auth.uid() AND dc.course_id = course_books.course_id
    )
  );

-- No DELETE policy: only owner_full_access_course_books (section 7) reaches
-- DELETE — default-deny-by-omission, same as exam_submissions/exam_reports.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_books TO authenticated;

REVOKE ALL ON FUNCTION public.can_read_course_book(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_course_book(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.upload_course_book(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upload_course_book(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

REVOKE ALL ON FUNCTION public.confirm_course_book(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_course_book(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_course_book(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_course_book(UUID, TEXT, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. DOCTOR BOOK SELECTION
-- ═══════════════════════════════════════════════════════════════════════════
-- The central requirement: two doctors teaching the same course, track and
-- semester may select DIFFERENT confirmed books. Selection lives on
-- doctor_courses (012) — one row per (doctor, course, academic_year,
-- semester) already exists there; this just adds which book that specific
-- teaching assignment uses.

ALTER TABLE public.doctor_courses
  ADD COLUMN selected_book_id UUID REFERENCES public.course_books(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.doctor_courses.selected_book_id IS
  'The course_book this specific teaching assignment uses. Nullable: a doctor may teach a course before any book is confirmed, or before they have chosen among several. Only a confirmed book may be selected — see select_course_book().';

CREATE INDEX idx_doctor_courses_selected_book ON public.doctor_courses(selected_book_id);

-- The only write path for selected_book_id. doctor_courses' existing RLS
-- (012) has no doctor-facing UPDATE policy at all (only
-- doctor_courses_update_admin) — set_doctor_courses() (012) already proved
-- the SECURITY DEFINER + owner-privilege pattern is sufficient for a
-- doctor's own row without one, and this function relies on the same thing.
CREATE OR REPLACE FUNCTION public.select_course_book(
  p_doctor_courses_id UUID,
  p_book_id           UUID
)
RETURNS public.doctor_courses AS $$
DECLARE
  v_assignment   public.doctor_courses;
  v_book         public.course_books;
  v_actor_id     UUID := public.effective_user_id();
  v_result       public.doctor_courses;
  impersonation  public.impersonation_sessions;
  extra_metadata JSONB := '{}'::JSONB;
BEGIN
  IF NOT public.is_doctor() THEN
    RAISE EXCEPTION 'Only a doctor may select a course book';
  END IF;
  IF NOT public.is_target_role(v_actor_id, 'doctor') THEN
    RAISE EXCEPTION 'The acting user is not a doctor';
  END IF;

  SELECT * INTO v_assignment
  FROM public.doctor_courses
  WHERE id = p_doctor_courses_id AND doctor_id = v_actor_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Unknown teaching assignment for the acting doctor';
  END IF;

  -- p_book_id may be NULL: clears the selection (e.g. the confirmed book was
  -- deleted, or the doctor wants to pick again later) without requiring a
  -- second RPC.
  IF p_book_id IS NOT NULL THEN
    SELECT * INTO v_book FROM public.course_books WHERE id = p_book_id;
    IF v_book.id IS NULL THEN
      RAISE EXCEPTION 'Unknown book';
    END IF;

    IF v_book.course_id <> v_assignment.course_id THEN
      RAISE EXCEPTION 'This book does not belong to the course being taught';
    END IF;

    IF v_book.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Only a confirmed book may be selected';
    END IF;
  END IF;

  UPDATE public.doctor_courses
  SET selected_book_id = p_book_id
  WHERE id = p_doctor_courses_id
  RETURNING * INTO v_result;

  -- doctor_courses has no audit_portal_change trigger (012 never attached
  -- one — see that migration's section 2), so this business-relevant change
  -- is logged explicitly here instead, same style as 012's
  -- start_impersonation()/end_impersonation() writing audit_logs directly
  -- for a table with no generic trigger.
  SELECT * INTO impersonation
  FROM public.impersonation_sessions
  WHERE owner_id = auth.uid() AND ended_at IS NULL AND expires_at > NOW()
  ORDER BY started_at DESC
  LIMIT 1;

  IF impersonation.id IS NOT NULL THEN
    extra_metadata := jsonb_build_object(
      'impersonated_by', jsonb_build_object(
        'owner_id', impersonation.owner_id,
        'target_user_id', impersonation.target_user_id,
        'session_id', impersonation.id
      )
    );
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'course_book_selected',
    'doctor_courses',
    v_result.id,
    jsonb_build_object('selected_book_id', p_book_id) || extra_metadata
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.select_course_book(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_course_book(UUID, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. STORAGE — dedicated private bucket, one bucket for the whole lifecycle
-- ═══════════════════════════════════════════════════════════════════════════
-- Unlike 012's exam-submissions-pending → exam-papers split (needed because
-- previous_exams goes from doctor-only to student-readable on approval),
-- course_books' read audience is IDENTICAL at every status — students never
-- read it, confirmed or not (task requirement #4) — so there is no bucket to
-- migrate a file into on confirmation and no Edge Function move step needed.

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-books', 'course-books', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "course_books_upload_council_or_doctor"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-books'
    AND (public.is_committee_admin() OR public.is_admin() OR public.is_doctor())
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "course_books_authorized_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-books' AND public.can_read_course_book(name));

-- No storage UPDATE/DELETE policy: files are immutable once uploaded (a
-- rejection creates a new row + new object, never overwrites one) — same
-- default-deny-by-omission as every other private bucket in this codebase.

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. INSTRUCTOR ATTRIBUTION
-- ═══════════════════════════════════════════════════════════════════════════
-- schedule_entries.instructor (009) is a free-text name from the university
-- feed — titles, accents, initials and spelling drift make it unsafe to
-- match against profiles directly. instructor_id is the authoritative link
-- when known; instructor_aliases is the ONLY mechanism allowed to populate
-- it from the free-text name, and it never guesses: an unmatched name stays
-- NULL, visibly, forever, until a human adds the matching alias.

ALTER TABLE public.schedule_entries
  ADD COLUMN instructor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.schedule_entries.instructor_id IS
  'Authoritative link to the teaching doctor, when known. Populated ONLY by exact-match resolution against instructor_aliases (see resolve_schedule_instructor_id() and resolve_schedule_instructors() below) — never inferred or fuzzy-matched. NULL means unresolved, not "no instructor": see course_unattributed_students for how that gap is surfaced to the council.';

CREATE INDEX idx_schedule_entries_instructor_id ON public.schedule_entries(instructor_id);
-- Backs course_book_print_counts' join below.
CREATE INDEX idx_schedule_entries_course_year_sem_instructor
  ON public.schedule_entries(course_id, academic_year, semester, instructor_id);

CREATE TABLE public.instructor_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Raw university-side label, exactly as it appears in schedule_entries.
  -- instructor (e.g. "Dr. Haddad"). Case/whitespace-insensitive matching is
  -- done via normalized_alias below; alias itself is kept for display so
  -- staff can see what they are mapping.
  alias            TEXT NOT NULL CHECK (char_length(btrim(alias)) > 0),
  normalized_alias TEXT NOT NULL UNIQUE,
  doctor_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note             TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.instructor_aliases IS
  'Staff-maintained mapping from a raw university instructor-name string to a doctor''s profiles.id. The ONLY source resolve_schedule_instructor_id()/resolve_schedule_instructors() are allowed to use — no fuzzy or partial matching anywhere in this system. An instructor string with no row here resolves to NULL, not a guess.';

CREATE TRIGGER set_instructor_aliases_updated_at
  BEFORE UPDATE ON public.instructor_aliases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_instructor_aliases_doctor ON public.instructor_aliases(doctor_id);

-- Auto-resolves instructor_id from instructor_aliases on every INSERT and
-- on any UPDATE that changes the instructor text — so
-- sync_student_academics() (009), which this migration does NOT modify,
-- benefits automatically the next time it runs: it already INSERTs
-- schedule_entries rows without setting instructor_id at all (defaulting to
-- NULL), and this BEFORE trigger fills it in when (and only when) an exact
-- alias match exists.
CREATE OR REPLACE FUNCTION public.resolve_schedule_instructor_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.instructor_id IS NULL AND NEW.instructor IS NOT NULL AND btrim(NEW.instructor) <> '' THEN
    SELECT doctor_id INTO NEW.instructor_id
    FROM public.instructor_aliases
    WHERE normalized_alias = lower(btrim(NEW.instructor));
    -- No match: NEW.instructor_id stays exactly what it was (NULL) — never
    -- guessed. This is precisely what makes course_unattributed_students
    -- meaningful instead of silently always-zero.
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER resolve_schedule_instructor_id_trigger
  BEFORE INSERT OR UPDATE OF instructor ON public.schedule_entries
  FOR EACH ROW EXECUTE FUNCTION public.resolve_schedule_instructor_id();

-- Bulk backfill for rows that predate this migration, or that need
-- re-resolving after staff adds/fixes an alias (the trigger above only
-- fires on a fresh INSERT or a change to the instructor column itself, not
-- retroactively when a NEW alias is added later). Read-and-report, not
-- silent: returns exactly how many rows it matched and how many are still
-- unmatched, so staff running it get the same "don't trust a quiet number"
-- signal the council gets from course_unattributed_students.
CREATE OR REPLACE FUNCTION public.resolve_schedule_instructors()
RETURNS TABLE (updated_count INTEGER, unmatched_count INTEGER) AS $$
DECLARE
  v_updated   INTEGER;
  v_unmatched INTEGER;
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only staff may run instructor resolution';
  END IF;

  UPDATE public.schedule_entries se
  SET instructor_id = alias.doctor_id
  FROM public.instructor_aliases alias
  WHERE se.instructor_id IS NULL
    AND btrim(se.instructor) <> ''
    AND lower(btrim(se.instructor)) = alias.normalized_alias;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT COUNT(*) INTO v_unmatched
  FROM public.schedule_entries
  WHERE instructor_id IS NULL AND btrim(instructor) <> '';

  RETURN QUERY SELECT v_updated, v_unmatched;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.set_instructor_alias(
  p_alias     TEXT,
  p_doctor_id UUID,
  p_note      TEXT DEFAULT ''
)
RETURNS public.instructor_aliases AS $$
DECLARE
  v_row        public.instructor_aliases;
  v_normalized TEXT := lower(btrim(COALESCE(p_alias, '')));
  v_actor_id   UUID := public.effective_user_id();
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only staff may maintain instructor aliases';
  END IF;
  IF NOT (public.is_target_role(v_actor_id, 'committee_admin') OR public.is_target_role(v_actor_id, 'admin')) THEN
    RAISE EXCEPTION 'The acting user is not authorized to maintain instructor aliases';
  END IF;

  IF v_normalized = '' THEN
    RAISE EXCEPTION 'An alias is required';
  END IF;

  IF NOT public.is_target_role(p_doctor_id, 'doctor') THEN
    RAISE EXCEPTION 'Target user is not a doctor';
  END IF;

  INSERT INTO public.instructor_aliases (alias, normalized_alias, doctor_id, created_by, note)
  VALUES (btrim(p_alias), v_normalized, p_doctor_id, v_actor_id, COALESCE(p_note, ''))
  ON CONFLICT (normalized_alias) DO UPDATE SET
    alias      = EXCLUDED.alias,
    doctor_id  = EXCLUDED.doctor_id,
    note       = EXCLUDED.note
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.delete_instructor_alias(p_alias_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_committee_admin()) THEN
    RAISE EXCEPTION 'Only staff may remove instructor aliases';
  END IF;

  DELETE FROM public.instructor_aliases WHERE id = p_alias_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE public.instructor_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instructor_aliases_select_staff"
  ON public.instructor_aliases FOR SELECT
  USING (public.is_admin() OR public.is_committee_admin());

-- No INSERT/UPDATE/DELETE policy: set_instructor_alias()/
-- delete_instructor_alias() (SECURITY DEFINER) are the only write paths —
-- same precedent as doctor_courses' set_doctor_courses() (012).

GRANT SELECT, INSERT, UPDATE, DELETE ON public.instructor_aliases TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_schedule_instructors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_schedule_instructors() TO authenticated;

REVOKE ALL ON FUNCTION public.set_instructor_alias(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_instructor_alias(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_instructor_alias(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_instructor_alias(UUID) TO authenticated;

-- resolve_schedule_instructor_id() is RETURNS TRIGGER, so — like
-- handle_updated_at()/handle_new_user()/audit_portal_change() — it is never
-- callable as a PostgREST RPC and gets no REVOKE/GRANT.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. PRINT-COUNT VISIBILITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Both views deliberately do NOT use security_invoker = true (unlike 009's
-- course_resources). A security_invoker view here would need the querying
-- role to already have SELECT on schedule_entries beyond its own row — which
-- committee_admin does not have under 009's original
-- schedule_select_self_or_admin policy (student_id = auth.uid() OR
-- is_admin() — committee_admin is not is_admin()) — and widening that
-- existing 009 policy just to make a view work is a bigger, riskier change
-- than this feature needs. Instead these views run as their owner (full
-- read of the underlying tables, same as 011's exam_quality_summary) and
-- gate who gets ANY row back via an explicit WHERE predicate.
--
-- DESIGN RISK, flagged rather than silently resolved: a student can have
-- MULTIPLE schedule_entries for the SAME course taught by DIFFERENT
-- instructors (a real shape in this codebase's own
-- mocks/university-api/server.mjs fixture — course "ff3" has a lecture
-- taught by "Dr. Haddad" and a TD taught by "Dr. Nassar"). If those two
-- doctors selected different books for the same course, that student is
-- counted once under EACH book below — an intentional over-count, not a
-- bug: for a print run, counting a student twice costs a spare copy;
-- silently picking one instructor's class as "the" one for that student
-- could just as easily be the wrong pick, and this migration has no basis
-- to invent that tie-breaking rule unilaterally. Recommend the council/
-- product clarify the intended policy (e.g. "count under the lecture
-- instructor only") if this over-count matters in practice.

CREATE OR REPLACE VIEW public.course_book_print_counts AS
  SELECT
    book.id                       AS book_id,
    book.course_id,
    book.course_title,
    book.course_title_fr,
    book.title                    AS book_title,
    book.status                   AS book_status,
    dc.academic_year,
    dc.semester,
    COUNT(DISTINCT se.student_id) AS attributed_student_count,
    (
      SELECT COUNT(DISTINCT se2.student_id)
      FROM public.schedule_entries se2
      WHERE se2.course_id = book.course_id
        AND se2.academic_year = dc.academic_year
        AND se2.semester = dc.semester
        AND se2.instructor_id IS NULL
    )                              AS unattributed_student_count
  FROM public.course_books book
  JOIN public.doctor_courses dc
    ON dc.selected_book_id = book.id
  LEFT JOIN public.schedule_entries se
    ON se.instructor_id = dc.doctor_id
   AND se.course_id = dc.course_id
   AND se.academic_year = dc.academic_year
   AND se.semester = dc.semester
  WHERE public.is_admin() OR public.is_committee_admin()
  GROUP BY book.id, book.course_id, book.course_title, book.course_title_fr,
           book.title, book.status, dc.academic_year, dc.semester;

COMMENT ON VIEW public.course_book_print_counts IS
  'One row per (book, academic_year, semester) that at least one doctor has selected, with a DISTINCT student count attributed via schedule_entries.instructor_id, plus the course''s own unattributed_student_count for that same academic_year/semester (repeated per row for display convenience — see course_unattributed_students for the course-level rollup that also covers courses with zero book selections). Restricted to is_admin()/is_committee_admin() via the WHERE predicate, not RLS/security_invoker — same pattern as 011''s exam_quality_summary. A confirmed book nobody has selected yet does not appear here; query course_books directly (status = ''confirmed'') for the full candidate list. See the design-risk comment above this view for the known double-count case when one student has multiple differently-taught class entries for the same course.';

GRANT SELECT ON public.course_book_print_counts TO authenticated;

-- Independent of course_book_print_counts, and of whether any book has been
-- selected at all: a course with zero doctor selections still needs its
-- coverage gap visible, not hidden behind an inner join that never matches.
CREATE OR REPLACE VIEW public.course_unattributed_students AS
  SELECT
    se.course_id,
    co.title                      AS course_title,
    co.title_fr                   AS course_title_fr,
    se.academic_year,
    se.semester,
    COUNT(DISTINCT se.student_id) AS unattributed_student_count
  FROM public.schedule_entries se
  JOIN public.courses co ON co.id = se.course_id
  WHERE se.instructor_id IS NULL
    AND (public.is_admin() OR public.is_committee_admin())
  GROUP BY se.course_id, co.title, co.title_fr, se.academic_year, se.semester;

COMMENT ON VIEW public.course_unattributed_students IS
  'Per (course, academic_year, semester): how many DISTINCT students have a schedule_entries row with instructor_id still NULL for that course — i.e. no instructor_aliases match yet for the university-supplied instructor string. Exists so the council can see a print-count gap even for a course where no doctor has selected a book yet, which course_book_print_counts (scoped to selected books only) cannot show. Restricted via WHERE, same pattern as course_book_print_counts.';

GRANT SELECT ON public.course_unattributed_students TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. COUNCIL WRITE-AUDIT COVERAGE — closes a gap in 012, not this file's own
--    code
-- ═══════════════════════════════════════════════════════════════════════════
-- previous_exams, entrance_exams and events (001) never received an
-- audit_portal_change() trigger in any of 001-013 — only the owner-only
-- audit_owner_write_<table> trigger from grant_owner_full_access() (009's
-- DO block includes all three). audit_owner_write() early-returns
-- `IF NOT public.is_owner() THEN RETURN COALESCE(NEW, OLD); END IF;`, so it
-- logs nothing for anyone else. 012 (section 4) then granted committee_admin
-- full INSERT/UPDATE/DELETE on all three tables via previous_exams_insert_
-- staff/entrance_exams_insert_staff/events_insert_staff and their UPDATE/
-- DELETE counterparts — meaning every non-owner council write to the exam
-- archive, entrance-exam archive or events calendar since 012 shipped has
-- been completely unlogged. This is purely additive (three CREATE TRIGGERs
-- referencing the already-existing audit_portal_change()) and low-risk: it
-- does not touch any policy, grant, or function body from 001-013, so it
-- ships here rather than waiting for a dedicated migration.
--
-- Net effect once this runs: an owner write to any of these three tables now
-- produces TWO audit_logs rows (one 'insert'/'update'/'delete' from this
-- trigger, one 'owner_insert'/'owner_update'/'owner_delete' from the
-- pre-existing owner trigger) — not a new problem, exam_submissions and
-- doctor_courses (012) already do exactly this for the same reason (both
-- triggers are independently useful: one gives a uniform per-table audit
-- stream, the other gives an owner-specific before/after diff).
--
-- Deliberately NOT widened here: audit_logs' own SELECT policy
-- (audit_logs_select_admin_or_committee_print, 008) still limits
-- committee_admin's own read access to entity_type = 'print_documents' —
-- these new rows are readable by admin/owner only, same as every other
-- audit_portal_change entity_type. That is oversight-of-council, which is
-- the point of an audit trail; widening committee_admin's OWN read access
-- to it is a separate product decision this migration does not make.

CREATE TRIGGER audit_previous_exams_change
  AFTER INSERT OR UPDATE OR DELETE ON public.previous_exams
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE TRIGGER audit_entrance_exams_change
  AFTER INSERT OR UPDATE OR DELETE ON public.entrance_exams
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

CREATE TRIGGER audit_events_change
  AFTER INSERT OR UPDATE OR DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.audit_portal_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. OWNER FULL ACCESS — applied last so it covers every table created above
-- ═══════════════════════════════════════════════════════════════════════════
-- doctor_courses and schedule_entries already have owner_full_access_*
-- policies from 012/009 respectively — a FOR ALL policy covers every column
-- of a table including one added afterward by ALTER TABLE, so
-- selected_book_id/instructor_id need no new owner policy. Only the two
-- brand-new tables need grant_owner_full_access() here.

DO $$
BEGIN
  PERFORM public.grant_owner_full_access('course_books');
  PERFORM public.grant_owner_full_access('instructor_aliases');
END $$;

-- ============================================================================
-- END OF MIGRATION 014
-- ============================================================================
