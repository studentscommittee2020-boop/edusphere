import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course, ExamType, Major, Semester, Track } from "@/types/database";

/**
 * Doctor teaching assignments (`doctor_courses`) and the doctor -> student
 * council exam review queue (`exam_submissions`) — migration 012
 * (supabase/migrations/012_impersonation_teaching_review_committee.sql).
 *
 * src/types/database.ts predates migration 012 (another agent is
 * regenerating it from the live schema in parallel with this file), so
 * doctor_courses, exam_submissions and
 * submit_exam_for_review() are all absent from the `Database` type the
 * `supabase` client is constructed with in src/lib/supabase.ts — calling
 * them through the typed client would not compile (unknown table/function
 * name). `db` below is that same client with only the schema generic
 * erased (SupabaseClient's own default is `Database = any`) — mirrors
 * src/services/reports.ts's `db` — used exclusively for those
 * not-yet-generated names. Every shape it hands back is still hand-typed
 * against migration 012's SQL directly below, never left as `any`. Swap
 * back to `supabase` (and drop the local types in favour of the generated
 * ones) once codegen catches up.
 *
 * Storage calls stay on the plain `supabase` client throughout: bucket ids
 * are plain strings, not part of the `Database` generic, so they never
 * needed the cast — same as src/services/materials.ts.
 */
const db = supabase as unknown as SupabaseClient;

// ── Types — mirror supabase/migrations/012_impersonation_teaching_review_committee.sql ──

export interface DoctorCourse {
  id: string;
  doctor_id: string;
  course_id: string;
  academic_year: string;
  semester: Semester;
  selected_book_id: string | null;
  is_active: boolean;
  schedule_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DoctorCourseWithCourse = DoctorCourse & { courses: Course | null };

export type ExamSubmissionStatus = "pending" | "approved" | "rejected";

export interface ExamSubmission {
  id: string;
  uploader_id: string;
  course_id: string | null;
  /** Denormalised from courses at submission time — survives the course record changing later. */
  course_title: string;
  course_title_fr: string;
  major: Major;
  semester: Semester;
  track: Track;
  year: string;
  exam_type: ExamType;
  pages: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: ExamSubmissionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  approved_exam_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Teaching assignments ─────────────────────────────────────────────────────

/** The signed-in doctor's own teaching assignments, joined to the course for display. */
export async function getDoctorCourses(doctorId: string) {
  const { data, error } = await db
    .from("doctor_courses")
    .select("*, courses(*)")
    .eq("doctor_id", doctorId)
    .eq("is_active", true)
    .order("academic_year", { ascending: false })
    .order("semester", { ascending: true });

  if (error) return { data: [] as DoctorCourseWithCourse[], error };
  return { data: (data ?? []) as DoctorCourseWithCourse[], error: null };
}

// ── Exam submissions (doctor -> student council review queue) ───────────────

const PDF_MIME_TYPE = "application/pdf";
const MAX_BYTES = 25 * 1024 * 1024;
const BUCKET = "exam-submissions-pending";

function validatePdf(file: File): Error | null {
  if (file.type !== PDF_MIME_TYPE) return new Error("Only PDF files are accepted.");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return new Error("Files must be between 1 byte and 25 MB.");
  }
  return null;
}

export interface SubmitExamForReviewInput {
  courseId: string;
  track: Track;
  year: string;
  examType: ExamType;
  pages: number;
}

/**
 * Uploads a past-exam PDF to the private `exam-submissions-pending` bucket,
 * then registers it via `submit_exam_for_review()` — the only write path
 * onto `exam_submissions` (no direct INSERT policy is granted; see
 * migration 012 §3). Upload-then-insert-with-compensating-delete, the same
 * shape as `publishMaterial()` in src/services/materials.ts.
 *
 * The storage policy (`exam_submissions_pending_doctor_upload`) requires
 * the object's first path segment to equal the uploader's own
 * `auth.uid()`, and `submit_exam_for_review()` independently re-checks
 * `p_storage_path LIKE auth.uid() || '/%'` server-side — so the leading
 * `${doctorId}/` segment below is load-bearing, not cosmetic. That check is
 * deliberately left on the REAL caller's id even under impersonation (the
 * row's own `uploader_id` is still written as the acting/target identity) —
 * see migration 012 section 6's design note on `submit_exam_for_review()`.
 *
 * Raises, surfaced verbatim as `error.message`:
 *   "Only a doctor may submit an exam for review" / "The acting user is not a doctor"
 *   "Unknown course" — bad course_id.
 *   "Only PDF files up to 25 MB are accepted"
 *   "Invalid submission storage path" / "Uploaded file was not found"
 */
export async function submitExamForReview(
  doctorId: string,
  file: File,
  details: SubmitExamForReviewInput,
) {
  const validationError = validatePdf(file);
  if (validationError) return { data: null, error: validationError };

  const path = `${doctorId}/${crypto.randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: PDF_MIME_TYPE, upsert: false });

  if (uploadError) return { data: null, error: uploadError };

  const { data, error } = await db.rpc("submit_exam_for_review", {
    p_course_id: details.courseId,
    p_track: details.track,
    p_year: details.year,
    p_exam_type: details.examType,
    p_pages: details.pages,
    p_storage_path: path,
    p_original_name: file.name,
    p_mime_type: PDF_MIME_TYPE,
    p_size_bytes: file.size,
  });

  // Don't leave an orphaned object in the pending bucket if the RPC fails.
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { data: null, error };
  }

  return { data: data as ExamSubmission, error: null };
}

/** The signed-in doctor's own submissions, newest first — status + rejection_reason included. */
export async function getMyExamSubmissions(uploaderId: string) {
  const { data, error } = await db
    .from("exam_submissions")
    .select("*")
    .eq("uploader_id", uploaderId)
    .order("created_at", { ascending: false });

  if (error) return { data: [] as ExamSubmission[], error };
  return { data: (data ?? []) as ExamSubmission[], error: null };
}
