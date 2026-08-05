import { supabase } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Course } from "@/types/database";

// Migration 016 is intentionally shipped with the feature, before a live
// schema exists from which to regenerate src/types/database.ts. Keep the
// untyped boundary narrow and make every feature shape explicit here.
const db = supabase as unknown as SupabaseClient;

export type CourseBookStatus = "pending_doctor_review" | "pending_council_review" | "confirmed" | "rejected";
export type CourseBookReviewStatus = "pending" | "confirmed" | "rejected";

export interface CourseBook {
  id: string;
  course_id: string;
  course_title: string;
  course_title_fr: string;
  title: string;
  uploaded_by: string;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: CourseBookStatus;
  replaces_book_id: string | null;
  restricted_to_doctor_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
  updated_at: string;
}

export interface CourseBookReview {
  id: string;
  book_id: string;
  doctor_course_id: string;
  doctor_id: string;
  status: CourseBookReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  replacement_book_id: string | null;
}

export interface CourseBookPrintCount {
  book_id: string;
  course_id: string;
  course_title: string;
  course_title_fr: string;
  book_title: string;
  academic_year: string;
  semester: string;
  attributed_student_count: number;
  unattributed_student_count: number;
}

export interface UnattributedCourseStudents {
  course_id: string;
  course_title: string;
  course_title_fr: string;
  academic_year: string;
  semester: string;
  unattributed_student_count: number;
}

export interface InstructorAlias {
  id: string;
  alias: string;
  doctor_id: string;
  note: string;
  updated_at: string;
}

export interface DoctorOption { id: string; full_name: string; }

export const COURSE_BOOK_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
] as const;

export const COURSE_BOOK_MAX_BYTES = 150 * 1024 * 1024;

function validBookFile(file: File): Error | null {
  if (!COURSE_BOOK_MIME_TYPES.includes(file.type as (typeof COURSE_BOOK_MIME_TYPES)[number])) {
    return new Error("Only PDF or PowerPoint files are accepted.");
  }
  if (file.size < 1 || file.size > COURSE_BOOK_MAX_BYTES) {
    return new Error("Book files must be between 1 byte and 150 MB.");
  }
  return null;
}

export async function getCourseBooks(): Promise<{ data: CourseBook[]; error: Error | null }> {
  const { data, error } = await db.from("course_books").select("*").order("created_at", { ascending: false });
  return { data: (data ?? []) as CourseBook[], error: error as Error | null };
}

export async function getMyCourseBookReviews(doctorId: string) {
  const { data, error } = await db
    .from("course_book_reviews")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false });
  return { data: (data ?? []) as CourseBookReview[], error: error as Error | null };
}

export async function getCourseBookUrl(storagePath: string) {
  const { data, error } = await supabase.storage.from("course-books").createSignedUrl(storagePath, 60);
  return { url: data?.signedUrl ?? null, error };
}

export async function reviewCourseBook(bookId: string, doctorCourseId: string, decision: "confirmed" | "rejected") {
  const { data, error } = await db.rpc("review_course_book", {
    p_book_id: bookId,
    p_doctor_course_id: doctorCourseId,
    p_decision: decision,
  });
  return { data: data as CourseBookReview | null, error: error as Error | null };
}

export async function selectCourseBook(doctorCourseId: string, bookId: string) {
  const { data, error } = await db.rpc("select_course_book", {
    p_doctor_course_id: doctorCourseId,
    p_book_id: bookId,
  });
  return { data, error: error as Error | null };
}

export async function uploadCourseBook(input: {
  file: File;
  title: string;
  courseId?: string;
  originalBookId?: string;
  doctorCourseId?: string;
  rejectionReason?: string;
}) {
  const error = validBookFile(input.file);
  if (error) return { data: null, error };
  const title = input.title.trim();
  if (title.length < 2 || title.length > 200) return { data: null, error: new Error("Use a book title between 2 and 200 characters.") };

  const form = new FormData();
  form.append("file", input.file);
  form.append("title", title);
  if (input.courseId) form.append("courseId", input.courseId);
  if (input.originalBookId) form.append("originalBookId", input.originalBookId);
  if (input.doctorCourseId) form.append("doctorCourseId", input.doctorCourseId);
  if (input.rejectionReason) form.append("rejectionReason", input.rejectionReason.trim());

  const { data, error: invokeError, response } = await supabase.functions.invoke<{ book?: CourseBook; error?: string }>(
    "course-book-upload",
    { body: form },
  );
  if (invokeError) {
    const body = response ? await response.json().catch(() => null) : null;
    return { data: null, error: new Error(body?.error ?? "Could not upload the book.") };
  }
  if (!data?.book) return { data: null, error: new Error(data?.error ?? "Could not upload the book.") };
  return { data: data.book, error: null };
}

export async function reviewDoctorReplacement(bookId: string, decision: "confirmed" | "rejected", rejectionReason = "") {
  const { data, error } = await db.rpc("review_doctor_book_replacement", {
    p_book_id: bookId,
    p_decision: decision,
    p_rejection_reason: rejectionReason.trim(),
  });
  return { data: data as CourseBook | null, error: error as Error | null };
}

export async function getCourseBookPrintCounts() {
  const { data, error } = await db.from("course_book_print_counts").select("*").order("academic_year", { ascending: false });
  return { data: (data ?? []) as CourseBookPrintCount[], error: error as Error | null };
}

export async function getUnattributedCourseStudents() {
  const { data, error } = await db.from("course_unattributed_students").select("*").order("academic_year", { ascending: false });
  return { data: (data ?? []) as UnattributedCourseStudents[], error: error as Error | null };
}

export async function getInstructorAliases() {
  const { data, error } = await db.from("instructor_aliases").select("*").order("alias", { ascending: true });
  return { data: (data ?? []) as InstructorAlias[], error: error as Error | null };
}

export async function getDoctorsForAliases() {
  const { data, error } = await db.from("profiles").select("id, full_name").eq("role", "doctor").order("full_name");
  return { data: (data ?? []) as DoctorOption[], error: error as Error | null };
}

export async function setInstructorAlias(alias: string, doctorId: string, note = "") {
  const { data, error } = await db.rpc("set_instructor_alias", {
    p_alias: alias.trim(),
    p_doctor_id: doctorId,
    p_note: note.trim(),
  });
  return { data: data as InstructorAlias | null, error: error as Error | null };
}

export async function syncTeachingAssignments() {
  const { data, error } = await db.rpc("sync_doctor_courses_from_schedule");
  return { data: data as { inserted_count: number; removed_count: number; unresolved_count: number }[] | null, error: error as Error | null };
}

export function courseForBook(book: CourseBook, courses: Course[]) {
  return courses.find((course) => course.id === book.course_id) ?? null;
}
