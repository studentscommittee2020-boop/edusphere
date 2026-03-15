import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/utils";

// ── Filters ───────────────────────────────────────────────────────────────────

export interface ExamFilters {
  major?: string;
  semester?: string;
  year?: string;
  examType?: "partiel" | "midterm" | "resit";
  track?: "french" | "english";
  search?: string;
}

export interface EntranceExamFilters {
  subject?: string;
  year?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  examLang?: string;
}

// ── Previous Exams ────────────────────────────────────────────────────────────

export async function getPreviousExams(filters?: ExamFilters) {
  let query = supabase
    .from("previous_exams")
    .select("*, courses(title, title_fr, code)")
    .order("year", { ascending: false })
    .order("rating", { ascending: false });

  if (filters?.major && filters.major !== "all") {
    query = query.eq("major", filters.major);
  }
  if (filters?.semester && filters.semester !== "all") {
    query = query.eq("semester", filters.semester);
  }
  if (filters?.year && filters.year !== "all") {
    query = query.eq("year", filters.year);
  }
  if (filters?.examType && filters.examType !== ("all" as string)) {
    query = query.eq("exam_type", filters.examType);
  }
  if (filters?.track && filters.track !== ("all" as string)) {
    query = query.eq("track", filters.track);
  }
  if (filters?.search) {
    const q = escapeLike(filters.search);
    query = query.or(
      `course_title.ilike.%${q}%,course_title_fr.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  return { data, error };
}

export async function getPreviousExamById(id: string) {
  const { data, error } = await supabase
    .from("previous_exams")
    .select("*, courses(*)")
    .eq("id", id)
    .single();
  return { data, error };
}

export async function getPreviousExamsByCourse(courseId: string) {
  const { data, error } = await supabase
    .from("previous_exams")
    .select("*")
    .eq("course_id", courseId)
    .order("year", { ascending: false });
  return { data, error };
}

// ── Entrance Exams ────────────────────────────────────────────────────────────

export async function getEntranceExams(filters?: EntranceExamFilters) {
  let query = supabase
    .from("entrance_exams")
    .select("*")
    .order("year", { ascending: false })
    .order("rating", { ascending: false });

  if (filters?.subject && filters.subject !== "all") {
    query = query.eq("subject", filters.subject);
  }
  if (filters?.year && filters.year !== "all") {
    query = query.eq("year", filters.year);
  }
  if (filters?.difficulty && filters.difficulty !== ("all" as string)) {
    query = query.eq("difficulty", filters.difficulty);
  }
  if (filters?.examLang && filters.examLang !== "all") {
    query = query.eq("exam_lang", filters.examLang);
  }

  const { data, error } = await query;
  return { data, error };
}

export async function getEntranceExamById(id: string) {
  const { data, error } = await supabase
    .from("entrance_exams")
    .select("*")
    .eq("id", id)
    .single();
  return { data, error };
}

// ── Rating ────────────────────────────────────────────────────────────────────

export async function rateExam(
  examId: string,
  table: "previous_exams" | "entrance_exams",
  rating: number
) {
  if (rating < 0 || rating > 5) return { data: null, error: new Error("Rating must be 0–5") };
  const { data, error } = await supabase
    .from(table)
    .update({ rating })
    .eq("id", examId)
    .select()
    .single();
  return { data, error };
}

// ── Download URL (from Supabase Storage) ─────────────────────────────────────

/**
 * Returns a signed URL valid for 60 seconds for downloading a private exam PDF.
 * If the bucket is public, use getPublicUrl instead.
 */
export async function getExamDownloadUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from("exam-papers")
    .createSignedUrl(filePath, 60); // 60-second expiry
  return { url: data?.signedUrl ?? null, error };
}
