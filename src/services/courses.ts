import { supabase } from "@/lib/supabase";
import { escapeLike } from "@/lib/utils";

export interface CourseFilters {
  major?: string;
  semester?: string;
  track?: "french" | "english";
  type?: "common" | "major";
  search?: string;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function getCourses(filters?: CourseFilters) {
  let query = supabase
    .from("courses")
    .select("*")
    .order("semester")
    .order("title");

  if (filters?.major && filters.major !== "all") {
    query = query.eq("major", filters.major);
  }
  if (filters?.semester && filters.semester !== "all") {
    query = query.eq("semester", filters.semester);
  }
  if (filters?.track && filters.track !== ("all" as string)) {
    query = query.eq("track", filters.track);
  }
  if (filters?.type && filters.type !== ("all" as string)) {
    query = query.eq("type", filters.type);
  }
  if (filters?.search) {
    const q = escapeLike(filters.search);
    query = query.or(
      `title.ilike.%${q}%,title_fr.ilike.%${q}%,code.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  return { data, error };
}

export async function getCourseById(id: string) {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();
  return { data, error };
}

/**
 * Returns courses with their associated exam and book counts.
 * Used by the Course Catalog page to show "2 exams | 1 book" links.
 */
export async function getCoursesWithCounts(filters?: CourseFilters) {
  // Fetch courses
  const { data: courses, error } = await getCourses(filters);
  if (error || !courses) return { data: null, error };

  // Fetch exam counts grouped by course_id
  const { data: examCounts } = await supabase
    .from("previous_exams")
    .select("course_id")
    .in(
      "course_id",
      courses.map((c) => c.id)
    );

  // Build a count map
  const examMap: Record<string, number> = {};
  for (const row of examCounts ?? []) {
    examMap[row.course_id] = (examMap[row.course_id] ?? 0) + 1;
  }

  const result = courses.map((c) => ({
    ...c,
    exam_count: examMap[c.id] ?? 0,
  }));

  return { data: result, error: null };
}

/**
 * Groups courses by semester — useful for the catalog's semester-section layout.
 */
export function groupCoursesBySemester<T extends { semester: string }>(
  courses: T[]
): Record<string, T[]> {
  return courses.reduce(
    (acc, course) => {
      if (!acc[course.semester]) acc[course.semester] = [];
      acc[course.semester].push(course);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

/**
 * Returns total credits for a group of courses.
 */
export function totalCredits(courses: Array<{ credits: number }>): number {
  return courses.reduce((sum, c) => sum + c.credits, 0);
}
