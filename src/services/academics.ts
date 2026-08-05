import { supabase } from "@/lib/supabase";
import type {
  AcademicSyncState,
  Course,
  CourseResource,
  ScheduleEntry,
  StudentEnrollment,
} from "@/types/database";

/**
 * Student academics: schedule, enrolments, and the resources attached to the
 * courses a student takes.
 *
 * Reads go straight to Postgres under RLS — a student can only ever see their
 * own rows. The write path is the university-sync Edge Function, which requires
 * the file number to be supplied fresh each time because it is never stored.
 */

export type EnrollmentWithCourse = StudentEnrollment & { courses: Course | null };
export type ScheduleEntryWithCourse = ScheduleEntry & { courses: Course | null };

// ── Sync ─────────────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  courses?: number;
  entries?: number;
  academic_year?: string;
  semester?: string;
}

/**
 * Pulls a fresh schedule and course history from the university.
 *
 * `fileNumber` is sent to the Edge Function and discarded there — it is not
 * persisted, logged, or returned. That is why the student must re-enter it
 * rather than this running on a timer.
 */
export async function syncAcademics(fileNumber: string, semester?: string) {
  const { data, error } = await supabase.functions.invoke<SyncResult>("university-sync", {
    body: { fileNumber: fileNumber.trim(), ...(semester ? { semester } : {}) },
  });

  if (error) return { data: null, error };
  if (!data?.ok) {
    return { data: null, error: new Error("Could not refresh your academic data.") };
  }
  return { data, error: null };
}

export async function getSyncState(studentId: string) {
  const { data, error } = await supabase
    .from("academic_sync_state")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();
  return { data: data as AcademicSyncState | null, error };
}

// ── Schedule ─────────────────────────────────────────────────────────────────

export async function getSchedule(studentId: string, academicYear?: string, semester?: string) {
  let query = supabase
    .from("schedule_entries")
    .select("*, courses(*)")
    .eq("student_id", studentId)
    .order("day_of_week", { ascending: true })
    .order("starts_at", { ascending: true });

  if (academicYear) query = query.eq("academic_year", academicYear);
  if (semester) query = query.eq("semester", semester as ScheduleEntry["semester"]);

  const { data, error } = await query;
  return { data: (data ?? []) as ScheduleEntryWithCourse[], error };
}

/** Groups entries into ISO weekday buckets 1–7, ready to render as columns. */
export function groupByDay(
  entries: ScheduleEntryWithCourse[],
): Record<number, ScheduleEntryWithCourse[]> {
  const days: Record<number, ScheduleEntryWithCourse[]> = {
    1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [],
  };
  for (const entry of entries) {
    (days[entry.day_of_week] ??= []).push(entry);
  }
  return days;
}

// ── Terms ────────────────────────────────────────────────────────────────────
//
// getSchedule(studentId) with no filter returns every term ever synced —
// sync_student_academics() replaces schedule_entries per (academic_year,
// semester), so old terms are never deleted, only superseded. Rendering that
// straight to a single-week grid stacks two or three terms of classes on top
// of each other. These helpers let the page keep fetching everything (it
// still needs the full set to offer a term switcher) while showing exactly
// one term at a time, client-side.

export interface ScheduleTerm {
  academicYear: string;
  semester: string;
}

/** Stable identity for a term — switcher state and filtering both key off this. */
export function termKey(term: ScheduleTerm): string {
  return `${term.academicYear}__${term.semester}`;
}

/**
 * Distinct terms present in a set of schedule entries, most recently synced
 * first — so `terms[0]` is always a sensible "current term" default.
 *
 * Deliberately keyed off each entry's own `synced_at`, not off
 * profiles.semester: the sync Edge Function now leaves profiles.semester
 * alone once it is first set (see its handoff note — a routine profile
 * refresh must not silently revoke a student's in-progress assignments),
 * so that field can lag reality indefinitely and would make a stale term
 * look "current" forever. `synced_at` has no such staleness problem — it is
 * stamped fresh by sync_student_academics() every time a term is actually
 * (re)synced. Ties fall back to academic_year/semester (fixed-width
 * "YYYY-YYYY" sorts lexicographically = chronologically) purely for a
 * deterministic order.
 */
export function listScheduleTerms(entries: ScheduleEntryWithCourse[]): ScheduleTerm[] {
  const latestByKey = new Map<string, { term: ScheduleTerm; syncedAt: string }>();
  for (const entry of entries) {
    const term: ScheduleTerm = { academicYear: entry.academic_year, semester: entry.semester };
    const key = termKey(term);
    const existing = latestByKey.get(key);
    if (!existing || entry.synced_at > existing.syncedAt) {
      latestByKey.set(key, { term, syncedAt: entry.synced_at });
    }
  }
  return Array.from(latestByKey.values())
    .sort((a, b) => {
      if (a.syncedAt !== b.syncedAt) return b.syncedAt.localeCompare(a.syncedAt);
      if (a.term.academicYear !== b.term.academicYear) {
        return b.term.academicYear.localeCompare(a.term.academicYear);
      }
      return b.term.semester.localeCompare(a.term.semester);
    })
    .map((x) => x.term);
}

/** Entries belonging to exactly one term. `term: null` returns everything unfiltered. */
export function filterEntriesByTerm(
  entries: ScheduleEntryWithCourse[],
  term: ScheduleTerm | null,
): ScheduleEntryWithCourse[] {
  if (!term) return entries;
  const key = termKey(term);
  return entries.filter(
    (entry) => termKey({ academicYear: entry.academic_year, semester: entry.semester }) === key,
  );
}

/**
 * The display title for a course.
 *
 * A course's title follows the language it is TAUGHT in (`courses.track`), not
 * the interface language the reader has selected. These are two independent
 * settings: a student can read the app in English while sitting a French-track
 * course, and that course keeps its French name.
 */
export function courseTitle(course: Pick<Course, "title" | "title_fr" | "track">): string {
  return course.track === "french" ? course.title_fr : course.title;
}

/** "08:30:00" → "08:30". Times are stored as Asia/Beirut wall-clock. */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** Minutes between two "HH:MM:SS" values — used to size timetable blocks. */
export function durationMinutes(startsAt: string, endsAt: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return Math.max(0, toMinutes(endsAt) - toMinutes(startsAt));
}

// ── Enrolments ───────────────────────────────────────────────────────────────

export async function getEnrollments(studentId: string) {
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("*, courses(*)")
    .eq("student_id", studentId)
    .order("academic_year", { ascending: false })
    .order("semester", { ascending: false });

  return { data: (data ?? []) as EnrollmentWithCourse[], error };
}

// ── Resources ────────────────────────────────────────────────────────────────

/**
 * Every resource attached to the courses this student takes — past exams,
 * doctor-published materials, and assignments — in one call.
 *
 * Passing no courseIds returns nothing rather than everything: an empty
 * enrolment list must not leak the full catalogue.
 */
export async function getResourcesForCourses(courseIds: string[]) {
  if (courseIds.length === 0) {
    return { data: [] as CourseResource[], error: null };
  }

  const { data, error } = await supabase
    .from("course_resources")
    .select("*")
    .in("course_id", courseIds)
    .order("created_at", { ascending: false });

  return { data: (data ?? []) as CourseResource[], error };
}

/** Short-lived signed URL for a private resource. */
export async function getResourceUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  return { url: data?.signedUrl ?? null, error };
}
